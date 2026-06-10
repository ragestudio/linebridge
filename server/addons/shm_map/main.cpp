#include <fcntl.h>
#include <node.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <v8.h>

#include <memory>
#include <string>

using namespace v8;

/**
 * Holds the info needed to clean up a shared memory mapping.
 * V8 calls our deleter with this struct when the SharedArrayBuffer
 * is garbage-collected, so we can munmap + close the fd.
 */
struct ShmHint {
	size_t size;  // total size of the mapping in bytes
	int fd;		  // POSIX shared memory file descriptor
	void *ptr;	  // starting address of the mmap'd region
};

/**
 * Called by V8 when the SharedArrayBuffer's BackingStore is destroyed.
 * This is the only safe time to release the physical memory - doing it
 * earlier would leave other processes with dangling pointers.
 *
 * @param data         The raw pointer (unused here, we use deleter_data).
 * @param length       The buffer length (unused, stored in ShmHint).
 * @param deleter_data Pointer to the ShmHint struct we allocated.
 */
void BackingStoreDeleter(void *data, size_t length, void *deleter_data) {
	ShmHint *h = static_cast<ShmHint *>(deleter_data);

	// Release the virtual address space mapping
	munmap(h->ptr, h->size);

	// Close the file descriptor - if this is the last reference
	// the kernel will reclaim the shared memory segment
	close(h->fd);

	// Free the hint struct we heap-allocated in Connect()
	delete h;
}

/**
 * Creates or opens a POSIX shared memory segment and wraps it in a
 * SharedArrayBuffer that JavaScript can use directly.
 *
 * This is the core of the addon: it bridges the gap between the OS
 * shared memory API (shm_open + mmap) and the V8 JavaScript engine.
 *
 * Steps:
 * 1. Validate and extract the name and size from JS arguments.
 * 2. Call shm_open() - creates the segment if it doesn't exist, or
 *    opens the existing one. The name is prefixed with "/" as required
 *    by POSIX.
 * 3. Call ftruncate() to set the segment size.
 * 4. Call mmap() with MAP_SHARED so writes are visible across processes.
 * 5. Wrap the raw pointer in a V8 BackingStore with a custom deleter
 *    so V8's GC will call munmap+close when the buffer is released.
 * 6. Create a SharedArrayBuffer from the BackingStore and return it.
 *
 * @param args [0] = map name (string)
 * @param args [1] = size in bytes (number)
 */
void Connect(const FunctionCallbackInfo<Value> &args) {
	Isolate *isolate = args.GetIsolate();
	Local<Context> context = isolate->GetCurrentContext();

	// --- argument validation ---
	if (args.Length() < 2 || !args[0]->IsString() || !args[1]->IsNumber()) {
		isolate->ThrowException(Exception::TypeError(String::NewFromUtf8(isolate, "Expected (name: string, size: number)").ToLocalChecked()));
		return;
	}

	// --- extract name and size ---
	// Utf8Value converts a V8 string to a C string (null-terminated)
	String::Utf8Value name_v8(isolate, args[0]);

	// POSIX requires shared memory names to start with "/"
	std::string name = std::string("/") + *name_v8;

	// Use size_t in case the caller needs >4GB segments
	size_t size = static_cast<size_t>(
		args[1]->NumberValue(context).ToChecked()
	);

	// --- 1. open (or create) the POSIX shared memory object ---
	// O_CREAT: create if it doesn't exist
	// O_RDWR:  open for reading and writing
	// 0666:    permissions (subject to umask)
	int fd = shm_open(name.c_str(), O_CREAT | O_RDWR, 0666);

	if (fd == -1) {
		isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "shm_open failed").ToLocalChecked()));
		return;
	}

	// Set the segment to the requested size. If the segment already
	// exists with a larger size this is a no-op; if it's smaller it
	// grows to 'size' (zero-filled by the kernel).
	ftruncate(fd, size);

	// --- 2. map the segment into this process's address space ---
	// MAP_SHARED: writes are visible to other processes that map the same fd
	// PROT_READ | PROT_WRITE: we need both
	void *ptr = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
	if (ptr == MAP_FAILED) {
		close(fd);
		isolate->ThrowException(Exception::Error(String::NewFromUtf8(isolate, "mmap failed").ToLocalChecked()));
		return;
	}

	// --- 3. create a cleanup context ---
	// We heap-allocate this; V8's GC will delete it via BackingStoreDeleter
	ShmHint *hint = new ShmHint{ size, fd, ptr };

	// --- 4. wrap the raw pointer in a V8 BackingStore ---
	// Instead of letting V8 allocate memory, we inject our mmap'd pointer.
	// The custom deleter ensures OS resources are freed when the JS buffer
	// is garbage-collected - not before (other processes may still need it).
	std::shared_ptr<BackingStore> backing = SharedArrayBuffer::NewBackingStore(
		ptr,
		size,
		BackingStoreDeleter,
		hint
	);

	// --- 5. create the SharedArrayBuffer and return it to JS ---
	Local<SharedArrayBuffer> sab = SharedArrayBuffer::New(isolate, backing);
	args.GetReturnValue().Set(sab);
}

/**
 * Removes the shared memory segment name from the system.
 *
 * shm_unlink() marks the segment for deletion. The actual memory is
 * not freed until the last process that has it mapped calls close()
 * (or exits). This is safe: any process that already has the buffer
 * can keep using it until it lets go.
 *
 * @param args [0] = map name (string)
 */
void Unlink(const FunctionCallbackInfo<Value> &args) {
	Isolate *isolate = args.GetIsolate();

	if (args.Length() < 1 || !args[0]->IsString()) {
		return;
	}

	String::Utf8Value name_v8(isolate, args[0]);

	// POSIX shared memory names must be prefixed with "/"
	std::string name = std::string("/") + *name_v8;

	// Tell the kernel to remove the name from /dev/shm.
	// The segment remains usable by existing mappings; only new
	// shm_open() calls with this name will fail (ENOENT).
	shm_unlink(name.c_str());
}

void Initialize(Local<Object> exports) {
	NODE_SET_METHOD(exports, "connect", Connect);
	NODE_SET_METHOD(exports, "unlink", Unlink);
}

NODE_MODULE(shm_map, Initialize)
