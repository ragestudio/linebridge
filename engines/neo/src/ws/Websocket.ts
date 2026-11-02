import { EventEmitter } from "tseep/lib/ee-safe.js"
import { Readable, Writable } from "node:stream"
import { array_buffer_to_string } from "../utils"

import type { uWebsockets } from "../uws"

/** Any payload accepted by uWebSockets or produced by streams. */
export type WebsocketMessage = string | Buffer | ArrayBuffer | ArrayBufferView

/** Events emitted by the websocket polyfill. */
export type WebsocketEventMap = {
	[event in string | symbol]: (...args: any[]) => void
} & {
	message: (message: WebsocketMessage, is_binary: boolean) => void
	close: (code: number, message: WebsocketMessage) => void
	drain: () => void
	ping: (message: WebsocketMessage) => void
	pong: (message: WebsocketMessage) => void
}

/**
 * Raw uws websocket with the context and polyfill attached by the engine.
 * The native wrapper merges the upgrade user data into the socket object.
 */
export interface WebsocketRaw<
	TContext = Record<string, any>,
> extends uWebsockets.WebSocket<{ context?: TContext }> {
	context?: TContext
	poly?: Websocket<TContext>
}

const FRAGMENTS = {
	FIRST: "FIRST",
	MIDDLE: "MIDDLE",
	LAST: "LAST",
} as const

type Fragment = (typeof FRAGMENTS)[keyof typeof FRAGMENTS]

export default class Websocket<
	TContext = Record<string, any>,
> extends EventEmitter<WebsocketEventMap> {
	#ws: WebsocketRaw<TContext> | null
	#ip: string
	#context: TContext
	#stream?: Readable | Writable
	#buffered_fragment?: WebsocketMessage
	#closed = false

	constructor(ws: WebsocketRaw<TContext>) {
		super()

		this.#ws = ws
		this.#context = ws.context || ({} as TContext)
		this.#ip = array_buffer_to_string(ws.getRemoteAddressAsText())
	}

	/**
	 * Alias of uws cork, used to batch multiple operations for efficiency.
	 */
	atomic(
		callback: () => void,
	): Websocket<TContext> | uWebsockets.WebSocket<{ context?: TContext }> {
		return this.#ws ? this.#ws.cork(callback) : this
	}

	/**
	 * Sends a message over the connection.
	 * Returns the uws send status, or false when the socket is closed.
	 */
	send(
		message: WebsocketMessage,
		is_binary?: boolean,
		compress?: boolean,
	): number | false {
		if (this.#ws) return this.#ws.send(message, is_binary, compress)
		return false
	}

	/**
	 * Sends a ping control message.
	 */
	ping(message?: WebsocketMessage): number | false {
		return this.#ws ? this.#ws.ping(message) : false
	}

	/**
	 * Destroys this polyfill and dereferences the underlying socket.
	 * @private
	 */
	_destroy(): void {
		this.#ws = null
		this.#closed = true
	}

	/**
	 * Gracefully closes the connection, sending an optional code and message.
	 */
	close(code?: number, message?: WebsocketMessage): void {
		if (this.#ws) this.#ws.end(code, message)
	}

	/**
	 * Forcefully closes the connection without a close message.
	 */
	destroy(): void {
		if (this.#ws) this.#ws.close()
	}

	/**
	 * Returns whether this connection is subscribed to the topic.
	 */
	is_subscribed(topic: string): boolean {
		return this.#ws ? this.#ws.isSubscribed(topic) : false
	}

	/**
	 * Subscribes to a topic in mqtt syntax.
	 */
	subscribe(topic: string): boolean {
		return this.#ws ? this.#ws.subscribe(topic) : false
	}

	/**
	 * Unsubscribes from a topic.
	 */
	unsubscribe(topic: string): boolean {
		return this.#ws ? this.#ws.unsubscribe(topic) : false
	}

	/**
	 * Publishes a message to a topic in mqtt syntax.
	 */
	publish(
		topic: string,
		message: WebsocketMessage,
		is_binary?: boolean,
		compress?: boolean,
	): boolean {
		return this.#ws
			? this.#ws.publish(topic, message, is_binary, compress)
			: false
	}

	/**
	 * Buffers the provided fragment and returns the previously buffered one.
	 */
	_buffer_fragment(
		fragment?: WebsocketMessage,
	): WebsocketMessage | undefined {
		const current = this.#buffered_fragment
		this.#buffered_fragment = fragment
		return current
	}

	/**
	 * Writes a fragment using the appropriate uws fragment method.
	 */
	_write(
		type: Fragment,
		chunk: WebsocketMessage,
		is_binary?: boolean,
		compress?: boolean,
		callback?: () => void,
	): number {
		if (!this.#ws) {
			throw new Error("Websocket is no longer connected.")
		}

		let sent: number

		switch (type) {
			case FRAGMENTS.FIRST:
				sent = this.#ws.sendFirstFragment(chunk, is_binary, compress)
				break
			case FRAGMENTS.MIDDLE:
				sent = this.#ws.sendFragment(chunk, compress)
				break
			case FRAGMENTS.LAST:
				sent = this.#ws.sendLastFragment(chunk, compress)
				break
			default:
				throw new Error(
					"Websocket._write() -> invalid fragment type constant provided.",
				)
		}

		if (sent) {
			if (callback) callback()
		} else {
			// wait for drain before retrying this chunk
			this.once("drain", () =>
				this._write(type, chunk, is_binary, compress, callback),
			)
		}

		return sent
	}

	/**
	 * Streams a chunk, pausing the source stream while under backpressure.
	 */
	_stream_chunk(
		stream: Readable,
		type: Fragment,
		chunk: WebsocketMessage,
		is_binary: boolean,
	): void {
		if (this.#ws === null) return

		const sent = this._write(type, chunk, is_binary)
		if (!sent) {
			stream.pause()

			this.once("drain", () =>
				this._stream_chunk(stream, type, chunk, is_binary),
			)
		} else if (stream.isPaused()) {
			stream.resume()
		}
	}

	/**
	 * Streams a readable as a single fragmented message.
	 */
	stream(readable: Readable, is_binary = true): Promise<void> {
		if (!(readable instanceof Readable)) {
			throw new Error(
				"Websocket.stream(readable) -> readable must be a Readable stream.",
			)
		}

		if (this.#stream) {
			throw new Error(
				"Websocket.stream(readable) -> you may not stream data while another stream operation is active on this websocket.",
			)
		}

		return new Promise((resolve) => {
			this.#stream = readable

			let is_first = true

			readable.on("data", (chunk: Buffer) => {
				const fragment = this._buffer_fragment(chunk)
				if (!fragment) return

				this._stream_chunk(
					readable,
					is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE,
					fragment,
					is_binary,
				)

				if (is_first) is_first = false
			})

			const end_stream = () => {
				const fragment = this._buffer_fragment()

				if (is_first) {
					this.#ws!.send(fragment!, is_binary)
				} else {
					this._stream_chunk(
						readable,
						FRAGMENTS.LAST,
						fragment!,
						is_binary,
					)
				}

				this.#stream = undefined
				resolve()
			}

			readable.once("end", end_stream)
		})
	}

	/* getters */

	/**
	 * Underlying uws websocket object.
	 */
	get raw(): WebsocketRaw<TContext> | null {
		return this.#ws
	}

	/**
	 * Remote ip address of this connection.
	 */
	get ip(): string {
		return this.#ip
	}

	/**
	 * Context values attached during the upgrade.
	 */
	get context(): TContext {
		return this.#context
	}

	/**
	 * Whether this connection is closed.
	 */
	get closed(): boolean {
		return this.#closed
	}

	/**
	 * Bytes currently buffered in backpressure.
	 */
	get buffered(): number {
		return this.#ws ? this.#ws.getBufferedAmount() : 0
	}

	/**
	 * Topics this connection is subscribed to.
	 */
	get topics(): string[] {
		return this.#ws ? this.#ws.getTopics() : []
	}

	/**
	 * Writable stream bound to this connection for piping.
	 * Only one writable can be used at a time.
	 */
	get writable(): Writable {
		if (this.#stream) {
			throw new Error(
				"Websocket.writable -> you may only access and utilize one writable stream at any given time.",
			)
		}

		let is_first = true

		const writable = new Writable({
			write: (chunk, _encoding, callback) => {
				const fragment = this._buffer_fragment(chunk)

				if (fragment) {
					this._write(
						is_first ? FRAGMENTS.FIRST : FRAGMENTS.MIDDLE,
						fragment,
						true,
						false,
						callback,
					)

					if (is_first) is_first = false
				} else {
					callback()
				}
			},
		})

		this.#stream = writable

		const end_stream = () => {
			const fragment = this._buffer_fragment()

			if (is_first) {
				this.#ws!.send(fragment!, true, false)
				this.#stream = undefined
			} else {
				this._write(
					FRAGMENTS.LAST,
					fragment!,
					true,
					false,
					() => (this.#stream = undefined),
				)
			}
		}

		writable.on("finish", end_stream)

		return writable
	}
}
