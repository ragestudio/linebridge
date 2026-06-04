import { TextEncoder, TextDecoder } from "util"
const shmAddon = require("./build/Release/shm_map.node")

/**
 * Number of Int32 slots used for the key in each entry.
 * Keys are fixed at 32 bytes (8 Int32 values).
 */
const KEY_I32_LEN = 8

/**
 * Number of Int32 slots used for the value in each entry.
 * Values are fixed at 256 bytes (64 Int32 values).
 */
const VAL_I32_LEN = 64

/**
 * Number of Int32 slots used for entry metadata.
 * Layout: [Status (1 Int32), Value Length in bytes (1 Int32)] = 8 bytes total.
 * Status: 0 = empty slot, 1 = occupied slot.
 */
const META_I32_LEN = 2

/**
 * Total Int32 slots per entry = metadata + key + value.
 */
const ENTRY_I32_LEN = META_I32_LEN + KEY_I32_LEN + VAL_I32_LEN

/**
 * Key size in bytes (32).
 */
const KEY_SIZE = KEY_I32_LEN * 4

/**
 * Value size in bytes (256).
 */
const VAL_SIZE = VAL_I32_LEN * 4

/**
 * Maximum number of spin iterations before the lock is forcefully released
 * to break out of a potential deadlock. At 10 million spins on a modern CPU
 * this is roughly a few milliseconds.
 */
const DEADLOCK_SPIN_LIMIT = 10_000_000

/**
 * A fixed-size hash map stored in shared memory, accessible across processes.
 *
 * ## Overview
 *
 * SharedMap uses `SharedArrayBuffer` backed by POSIX shared memory (via the
 * native `shm_map` addon) so multiple Node.js processes can read and write
 * the same map concurrently. Synchronization is done with a custom spinlock
 * built on `Atomics.compareExchange`.
 *
 * ## Data layout in shared memory
 *
 * The shared memory region is organized as follows:
 *
 * ```
 * Byte offset  | Size     | Field
 * -------------|----------|------------------------------
 * 0            | 4 bytes  | Spinlock (1 Int32)
 * 4            | varies   | Entry array (see below)
 * ```
 *
 * Each entry occupies `ENTRY_I32_LEN` Int32 values (4 bytes each):
 *
 * ```
 * Int32 offset | Content
 * -------------|------------------------------------------------
 * +0           | Status: 0 = free, 1 = occupied
 * +1           | Value length in bytes
 * +2 ... +9    | Key (8 Int32 = 32 bytes, UTF-8 encoded)
 * +10 ... +73  | Value (64 Int32 = 256 bytes, UTF-8 encoded)
 * ```
 *
 * ## Collision resolution
 *
 * The map uses **open addressing with linear probing**. When the slot
 * computed by the hash function is occupied and the keys don't match,
 * the next slot is tried, wrapping around the table. Probing continues
 * until a free slot is found (for `set`) or the key is matched (for `get`).
 *
 * ## Hashing
 *
 * Keys are hashed with **FNV-1a (32-bit)** over the raw Int32 key words.
 * The 32-bit result is reduced modulo `maxEntries` to get the starting
 * bucket index.
 *
 * ## Locking
 *
 * A simple **spinlock** protects all read and write operations:
 *
 * - `compareExchange(0, 1)` tries to acquire the lock.
 * - On contention the thread spins, re-checking the lock.
 * - If the spin count exceeds `DEADLOCK_SPIN_LIMIT`, the lock is
 *   forcefully reset to 0 to prevent a stuck process from holding
 *   the lock forever (best-effort deadlock recovery).
 *
 * The lock is released via `Atomics.store(..., 0)` in a `finally` block
 * so it's always freed even if an operation throws.
 *
 * ## Thread safety notes
 *
 * - The spinlock only protects against inter-process races. It does
 *   NOT protect against multiple threads in the same process. For
 *   single-process multi-thread usage, use `SharedMap` only with
 *   Worker threads that coordinate externally.
 * - Keys and values must fit within their fixed sizes (32 and 256
 *   bytes respectively). Longer strings are silently truncated.
 *
 * ## Example
 *
 * ```ts
 * const map = new SharedMap("my-map", 10000)
 * map.set("hello", "world")
 * const value = map.get("hello") // "world"
 * map.destroy()
 * ```
 */
export class SharedMap {
	/** The shared memory segment backing the entire map. */
	private readonly sab: SharedArrayBuffer

	/**
	 * Spinlock stored in the first 4 bytes of the shared buffer.
	 * 0 = unlocked, 1 = locked.
	 */
	private readonly lockArray: Int32Array

	/** View of the entry array as Int32 values (for aligned access). */
	private readonly memory32: Int32Array

	/** View of the entry array as bytes (for byte-level copy). */
	private readonly memory8: Uint8Array

	/** Encodes JS strings into UTF-8 bytes. */
	private readonly encoder: TextEncoder

	/** Decodes UTF-8 bytes back into JS strings. */
	private readonly decoder: TextDecoder

	/**
	 * Scratch buffer for the key being operated on.
	 * We use a private `ArrayBuffer` (not the shared one) to avoid
	 * lock contention during key preparation.
	 *
	 * - `keyScratch32`: Int32 view of the scratch key buffer.
	 * - `keyScratch8`:  byte view of the scratch key buffer.
	 */
	private readonly keyScratch32: Int32Array
	private readonly keyScratch8: Uint8Array

	/**
	 * Scratch buffer for the value being operated on.
	 * Same design as the key scratch buffer: private memory so encoding
	 * and decoding never touch the shared segment without the lock.
	 *
	 * - `valScratch32`: Int32 view of the scratch value buffer.
	 * - `valScratch8`:  byte view of the scratch value buffer.
	 */
	private readonly valScratch32: Int32Array
	private readonly valScratch8: Uint8Array

	/** Human-readable identifier for this shared memory segment. */
	public readonly name: string

	/** Maximum number of entries the map can hold before it throws. */
	public readonly maxEntries: number

	/**
	 * Creates or connects to a shared memory map.
	 *
	 * @param mapId - Unique name for the shared memory segment.
	 *                Multiple processes using the same `mapId` share the same map.
	 * @param maxEntries - Maximum number of key-value pairs the map can store.
	 *                     Defaults to 10,000.
	 *
	 * The total shared memory size is:
	 * `4 (lock) + ENTRY_I32_LEN * 4 * maxEntries` bytes.
	 */
	constructor(mapId: string, maxEntries: number = 10000) {
		this.name = mapId
		this.maxEntries = maxEntries

		// Total shared memory = lock (4 bytes) + entry table.
		// Each entry is ENTRY_I32_LEN Int32 values, each Int32 is 4 bytes.
		const shmSize = 4 + ENTRY_I32_LEN * 4 * this.maxEntries

		// Ask the native addon to open/create the POSIX shared memory segment.
		// Returns a SharedArrayBuffer that other processes can also map.
		this.sab = shmAddon.connect(this.name, shmSize)

		// Byte 0..3: the spinlock, a single Int32.
		this.lockArray = new Int32Array(this.sab, 0, 1)

		// Byte 4 onward: the entry table.
		// memory32 = Int32 view for aligned access (keys, metadata).
		// memory8  = byte view for byte-level value copy.
		this.memory32 = new Int32Array(this.sab, 4)
		this.memory8 = new Uint8Array(this.sab, 4)

		// String <-> UTF-8 conversion helpers.
		this.encoder = new TextEncoder()
		this.decoder = new TextDecoder()

		// Scratch buffers live in regular heap memory, not shared memory.
		// This means encoding/decoding never touches the shared segment
		// without holding the lock — no partial writes visible to others.
		const keyBuffer = new ArrayBuffer(KEY_SIZE)
		this.keyScratch32 = new Int32Array(keyBuffer)
		this.keyScratch8 = new Uint8Array(keyBuffer)

		const valBuffer = new ArrayBuffer(VAL_SIZE)
		this.valScratch32 = new Int32Array(valBuffer)
		this.valScratch8 = new Uint8Array(valBuffer)
	}

	/**
	 * Acquires the spinlock, busy-waiting until the lock is free.
	 *
	 * If the lock is held for more than `DEADLOCK_SPIN_LIMIT` iterations,
	 * it is forcefully released. This is a best-effort recovery for when
	 * a process crashes while holding the lock.
	 *
	 * @private
	 */
	private _lock(): void {
		let spins = 0

		// Atomically try to swap 0 -> 1. If the old value was already 1,
		// someone else holds the lock, so we spin and retry.
		while (Atomics.compareExchange(this.lockArray, 0, 0, 1) !== 0) {
			// Deadlock safety valve: after too many spins, assume the
			// lock holder crashed. Force-unlock and restart the counter.
			// Two contending processes may both reset it, but that's fine —
			// the next compareExchange will still only let one through.
			if (++spins > DEADLOCK_SPIN_LIMIT) {
				Atomics.store(this.lockArray, 0, 0)
				spins = 0
			}
		}
	}

	/**
	 * Releases the spinlock by atomically setting it to 0.
	 *
	 * @private
	 */
	private _unlock(): void {
		// Plain store is enough — only the lock holder calls unlock,
		// so there is no race on the write.
		Atomics.store(this.lockArray, 0, 0)
	}

	/**
	 * Computes the FNV-1a 32-bit hash of an Int32 key array.
	 *
	 * FNV-1a works by XOR'ing each input word with the current hash
	 * and then multiplying by the FNV prime (16777619).
	 *
	 * The result is reduced modulo `maxEntries` to produce a valid
	 * bucket index.
	 *
	 * @param key32 - The key as Int32Array (length = KEY_I32_LEN).
	 * @returns Bucket index in `[0, maxEntries)`.
	 *
	 * @private
	 */
	private _hash32(key32: Int32Array): number {
		// FNV-1a offset basis (32-bit).
		let h = 2166136261

		// XOR the hash with each 32-bit word of the key, then multiply
		// by the FNV prime. Math.imul gives true 32-bit integer multiply.
		for (let i = 0; i < KEY_I32_LEN; i++) {
			h = Math.imul(h ^ key32[i], 16777619)
		}

		// Force unsigned 32-bit (>>> 0) then reduce to a valid bucket index.
		return (h >>> 0) % this.maxEntries
	}

	/**
	 * Inserts or updates a key-value pair in the shared map.
	 *
	 * The key and value must already be written into the scratch buffers
	 * (`keyScratch32` and `valScratch32`) before calling this method.
	 *
	 * Algorithm:
	 * 1. Hash the key from the scratch buffer to find the starting slot.
	 * 2. Acquire the spinlock.
	 * 3. Linear-probe through the table:
	 *    - If an empty slot (status 0) is found: write the entry and return.
	 *    - If the key matches an existing entry: update its value and return.
	 * 4. If the table is full, throw "Out of memory".
	 * 5. Always release the lock (via `finally`).
	 *
	 * @param valLen - Length of the value in bytes.
	 *
	 * @throws {Error} When the map has no free slots.
	 *
	 * @private
	 */
	private _setInternal(valLen: number): void {
		// Compute the starting bucket from the key in the scratch buffer.
		const startIdx = this._hash32(this.keyScratch32)

		// Round up to the nearest Int32 count: (valLen + 3) >> 2 === ceil(valLen / 4).
		// We always copy whole Int32 words even if the last one is partially used;
		// the valLen field tells readers how many bytes are actually valid.
		const valI32Count = (valLen + 3) >> 2

		// Take the lock before touching the shared table.
		this._lock()

		try {
			// Linear probe: start at the hash index, step forward, wrap around.
			// The table never resizes, so if we visit all slots without finding
			// a free one we throw.
			for (let i = 0; i < this.maxEntries; i++) {
				const idx = (startIdx + i) % this.maxEntries

				// offset32 = position of this entry in the Int32 array.
				// Each entry is ENTRY_I32_LEN Int32 values wide.
				const offset32 = idx * ENTRY_I32_LEN

				if (this.memory32[offset32] === 0) {
					// Empty slot — write a new entry.
					// Layout: [status=1, valLen, key[0..7], value[0..N]].
					this.memory32[offset32] = 1
					this.memory32[offset32 + 1] = valLen

					// Copy key words from scratch buffer into shared memory.
					for (let k = 0; k < KEY_I32_LEN; k++) {
						this.memory32[offset32 + 2 + k] = this.keyScratch32[k]
					}

					// Copy value words. Only valI32Count words are written;
					// trailing bytes in the last word are ignored on read.
					for (let k = 0; k < valI32Count; k++) {
						this.memory32[offset32 + 10 + k] = this.valScratch32[k]
					}
					return
				}

				// Occupied slot — compare the full 32-byte key to see if it matches.
				// We bail out on the first differing word (short-circuit).
				let match = true

				for (let k = 0; k < KEY_I32_LEN; k++) {
					if (
						this.memory32[offset32 + 2 + k] !== this.keyScratch32[k]
					) {
						match = false
						break
					}
				}

				if (match) {
					// Key exists — update the value in place.
					// Only the length and value words are overwritten; the key stays.
					this.memory32[offset32 + 1] = valLen

					for (let k = 0; k < valI32Count; k++) {
						this.memory32[offset32 + 10 + k] = this.valScratch32[k]
					}

					return
				}

				// Key doesn't match — continue probing the next slot.
			}

			// Table is full. The caller must use a larger maxEntries or
			// free slots (currently there's no delete operation).
			throw new Error("SharedMap: Out of memory")
		} finally {
			// Always unlock, even if we throw.
			this._unlock()
		}
	}

	/**
	 * Looks up a key in the shared map and copies the value into a
	 * caller-provided buffer.
	 *
	 * The key must already be written into `keyScratch32` before calling.
	 *
	 * Algorithm:
	 * 1. Hash the key to find the starting slot.
	 * 2. Acquire the spinlock.
	 * 3. Linear-probe through the table:
	 *    - If an empty slot (status 0) is found: key not present, return -1.
	 *    - If the key matches: copy the value bytes into `outBuffer8` and
	 *      return the value length in bytes.
	 * 4. If the whole table is scanned without a match, return -1.
	 * 5. Always release the lock (via `finally`).
	 *
	 * @param outBuffer8 - Byte buffer where the value will be copied.
	 * @returns The value length in bytes, or -1 if the key was not found.
	 *
	 * @private
	 */
	private _getInternal(outBuffer8: Uint8Array): number {
		// Hash the key from the scratch buffer to find the starting slot.
		const startIdx = this._hash32(this.keyScratch32)

		// Take the lock before reading the shared table.
		this._lock()
		try {
			// Linear probe through the table, same as set.
			for (let i = 0; i < this.maxEntries; i++) {
				const idx = (startIdx + i) % this.maxEntries
				const offset32 = idx * ENTRY_I32_LEN

				// Empty slot means the key is definitely not in the map —
				// if it were, it would have been placed here or probed past here.
				if (this.memory32[offset32] === 0) return -1

				// Compare the full 32-byte key word by word.
				let match = true
				for (let k = 0; k < KEY_I32_LEN; k++) {
					if (
						this.memory32[offset32 + 2 + k] !== this.keyScratch32[k]
					) {
						match = false
						break
					}
				}

				if (match) {
					// Key found — read the value length and copy bytes out.
					const valLen = this.memory32[offset32 + 1]

					// Convert Int32 offset to byte offset: value starts at
					// (offset32 + 10) Int32 positions * 4 bytes each.
					const byteStart = (offset32 + 10) * 4

					// Copy valLen bytes from the shared buffer into the caller's buffer.
					// Using the byte view (memory8) avoids manual bit shifting.
					for (let b = 0; b < valLen; b++) {
						outBuffer8[b] = this.memory8[byteStart + b]
					}

					return valLen
				}

				// Key doesn't match — keep probing.
			}

			// Scanned the whole table, key not found.
			return -1
		} finally {
			this._unlock()
		}
	}

	/**
	 * Stores a raw byte-array key-value pair in the map.
	 *
	 * Unlike `set`, this method works directly with `Uint8Array` buffers
	 * instead of JavaScript strings. Useful when the caller already has
	 * binary data or wants to control encoding manually.
	 *
	 * Keys longer than 32 bytes and values longer than 256 bytes are
	 * silently truncated.
	 *
	 * @param key - Raw key bytes (max 32 bytes used).
	 * @param value - Raw value bytes (max 256 bytes used).
	 * @param valLen - Actual number of bytes to store from `value`.
	 */
	public setRaw(key: Uint8Array, value: Uint8Array, valLen: number): void {
		// Zero out the scratch buffers so stale data from a previous call
		// doesn't leak into the comparison or the stored value.
		this.keyScratch32.fill(0)
		this.valScratch32.fill(0)

		// Copy key bytes into the scratch buffer (byte by byte).
		// Bytes beyond KEY_SIZE are silently ignored (truncation).
		for (let i = 0; i < key.length && i < KEY_SIZE; i++) {
			this.keyScratch8[i] = key[i]
		}

		// Copy value bytes into the scratch buffer.
		// Only valLen bytes are copied; the rest stays zero.
		for (let i = 0; i < valLen && i < VAL_SIZE; i++) {
			this.valScratch8[i] = value[i]
		}

		// Delegate to the internal setter which handles hashing, locking, and probing.
		this._setInternal(valLen)
	}

	/**
	 * Retrieves a value by raw byte-array key.
	 *
	 * Unlike `get`, the value is written directly into a caller-provided
	 * `Uint8Array` instead of returning a string.
	 *
	 * @param key - Raw key bytes to look up.
	 * @param outBuffer - Buffer where the value bytes will be copied.
	 * @returns The value length in bytes, or -1 if the key was not found.
	 */
	public getRaw(key: Uint8Array, outBuffer: Uint8Array): number {
		// Zero the scratch key so stale data doesn't affect the lookup.
		this.keyScratch32.fill(0)

		// Copy key bytes into the scratch buffer.
		for (let i = 0; i < key.length && i < KEY_SIZE; i++) {
			this.keyScratch8[i] = key[i]
		}

		// _getInternal copies the value bytes directly into outBuffer.
		return this._getInternal(outBuffer)
	}

	/**
	 * Stores a string key-value pair in the map.
	 *
	 * Strings are encoded to UTF-8 before being written. If the encoded
	 * value exceeds 256 bytes the excess is silently truncated.
	 *
	 * If a value with the same key already exists, it is overwritten.
	 *
	 * @param key - The key string (max 32 UTF-8 bytes used).
	 * @param value - The value string (max 256 UTF-8 bytes used).
	 *
	 * @throws {Error} When the map has no free slots and the key is new.
	 */
	public set(key: string, value: string): void {
		// Clear scratch buffers from any previous operation.
		this.keyScratch32.fill(0)
		this.valScratch32.fill(0)

		// encodeInto writes UTF-8 bytes directly into the scratch buffer.
		// It returns { read, written } — we only need 'written' for the value.
		this.encoder.encodeInto(key, this.keyScratch8)

		const { written: valLen } = this.encoder.encodeInto(
			value,
			this.valScratch8,
		)

		// If the value is an empty string, valLen is 0. Use 0 explicitly
		// so the entry is stored with a zero-length value (not skipped).
		this._setInternal(valLen || 0)
	}

	/**
	 * Retrieves a value by string key.
	 *
	 * The key is UTF-8 encoded, hashed, and looked up in the map. If
	 * found, the stored bytes are decoded back into a JavaScript string.
	 *
	 * @param key - The key string to look up.
	 * @returns The value string, or `undefined` if the key is not found.
	 */
	public get(key: string): string | undefined {
		// Clear the scratch key and encode the lookup key as UTF-8.
		this.keyScratch32.fill(0)
		this.encoder.encodeInto(key, this.keyScratch8)

		// _getInternal copies the raw bytes into valScratch8.
		const len = this._getInternal(this.valScratch8)

		// -1 means the key was not found.
		if (len === -1) return undefined

		// Decode only the valid portion of the buffer (0..len).
		// subarray creates a view without copying — efficient.
		return this.decoder.decode(this.valScratch8.subarray(0, len))
	}

	/**
	 * Unlinks (removes) the shared memory segment from the system.
	 *
	 * After calling this the map is no longer accessible by name.
	 * Other processes that still hold a reference to the buffer can
	 * continue using it until they release it, but no new connections
	 * can be made.
	 *
	 * Call this when the map is no longer needed to avoid leaking
	 * shared memory segments in `/dev/shm`.
	 */
	public destroy(): void {
		// Tells the native addon to call shm_unlink on the POSIX segment.
		// Existing mappings stay valid, but new processes can't connect anymore.
		shmAddon.unlink(this.name)
	}
}

export default SharedMap
