# Neo Engine API

The Neo engine is the default HTTP/WS engine, built on **uWebSockets.js v20.68.0**. It extends `EngineAdaptor` and provides the full transport layer.

## Import

```ts
// The engine is automatically instantiated by the Server
// To use it, set: static useEngine = "neo"
```

The engine is registered in `src/engines/index.ts` and selected via the `useEngine` server param.

## Constructor

```ts
new Engine(server: Server)
```

## Engine Options

```ts
type EngineOptions = {
  is_ssl: boolean          // default: false
  auto_close: boolean      // default: true - graceful shutdown on SIGINT/SIGTERM
  trust_proxy: boolean     // default: false
  max_body_buffer: number  // default: 16 * 1024 (16 KB)
  max_body_length: number  // default: 250 * 1024 (250 KB)
  streaming?: any
}
```

## Properties

### `ws: RTEngine | null`
The RTEngine instance if WebSockets are enabled.

### `listen_socket: uWS.us_listen_socket | null`
The active listen socket (null if not listening).

### `uws: uwsEngine | null`
The underlying uWebSockets.js app instance (`TemplatedApp` or `SSLApp`).

### `port: number`
Resolved port from server params (default: 3000).

### `host: string`
Resolved host from server params (default: "0.0.0.0").

### `options: EngineOptions & uWS.AppOptions`
Merged engine and uWS options.

### `middlewares: Handler<HandlerKind.middleware>[]`
Global middleware handlers.

### `registers: Set<Record<string, string>>`
Registered route set.

### `socket_path?: string`
Unix socket path when `LB_SOCKET_MODE` is enabled.

## Methods

### `initialize(): Promise<void>`
Sets up the uWebSockets.js app:

1. Configures HTTP header limits
2. Detects SSL configuration
3. Creates `SSLApp` or `App` based on `is_ssl`
4. Sets up Unix socket mode if `LB_SOCKET_MODE` is set
5. Initializes RTEngine if WebSockets are enabled
6. Registers the default catch-all route (`/*` → 404)

### `listen(): Promise<void>`
Starts listening:

- TCP mode: `uws.listen(host, port, callback)`
- Socket mode: `uws.listen_unix(callback, socket_path)`
- Registers exit handlers for graceful shutdown if `auto_close` is enabled

### `close(): Promise<boolean>`
Gracefully closes:

1. Calls `ws.close()` if RTEngine is active
2. Closes the uWS listen socket
3. Returns `true` on success

### `register(route: Route<Server>): void`
Registers an HTTP route:

1. Calls `route._initialize(this.server)`
2. Normalizes method (`delete` → `del`)
3. Registers with uWS: `uws[method](path, handler)`
4. Adds to `registers` set

### `register_middleware(middleware): void`
Registers a global middleware. Wraps in `Handler<HandlerKind.middleware>` if needed.

### `publish(topic, message, is_binary?, compress?): boolean`
Publishes a message to all WebSocket subscribers of a topic (MQTT syntax).

### `num_of_subscribers(topic): number`
Returns the number of WebSocket subscribers for a topic.

## Body Parsing

The Neo engine handles body parsing automatically:

| Content-Type | Method |
|-------------|--------|
| `application/json` | `req.json()` |
| `application/x-www-form-urlencoded` | `req.urlencoded()` |
| `multipart/form-data` | `req.multipart()` |
| `text/*`, `application/xml`, etc. | `req.text()` |
| Unknown / no content-type | `req.text()` |

Body size limits:
- Buffer limit: `max_body_buffer` (16 KB default)
- Total limit: `max_body_length` (250 KB default)
- Exceeding limits triggers a 413 response

## Streaming

The Neo engine supports streaming request and response bodies:

- **Request streaming**: `req` extends `stream.Readable`
- **Response streaming**: `res` extends `stream.Writable`
- **File streaming**: `res.stream(readable, total_size?)`
- **Piping**: `req.pipe(destination)`
- **Live files**: `res.file(path)` with automatic file watching

## Internal Methods

### `on_request(native_req, native_res, route, socket?)`
Called by uWS for each incoming request. Constructs `Request` and `Response` objects and runs the middleware + handler pipeline.

### `request_iterator(request, response, route, allMiddlewares, cursor?)`
Recursively executes middlewares and the route handler. Handles body parsing on first iteration.

### `_resolve_pending_request()`
Decrements the pending request counter. Used for graceful shutdown tracking.

### `_defaultResponse(req, res)`
The default 404 handler for unmatched routes.
