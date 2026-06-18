# Response API

The `Response` object represents the outgoing HTTP response. It wraps a raw uWS `HttpResponse` and provides methods for status codes, headers, cookies (with signed cookie support), streaming, Server-Sent Events, redirects, and JSON/HTML shortcuts. It extends `stream.Writable`.

When using `defineRoute<MyAPI>()`, `res` is automatically typed with the engine-specific `Response` class.

## Import

```ts
// Response instances are created automatically by the engine.
// Available as the second parameter in route handlers and middlewares.
```

## Properties

### `completed: boolean`
Whether the response has been sent or the connection was aborted.

### `initiated: boolean`
Whether response headers have been written to the wire.

### `statusCode: number`
Getter/setter for the HTTP status code. Defaults to `200`.

```ts
res.statusCode       // 200
res.statusCode = 404
```

### `statusMessage: string | null`
Getter/setter for a custom status message. If not set, the standard message for the status code is used (e.g. `"OK"`, `"Not Found"`).

```ts
res.statusMessage = "Custom Message"
// → "404 Custom Message"
```

### `headersSent: boolean`
Whether response headers have been sent. Alias for `initiated`.

### `aborted: boolean`
Whether the response has been completed (sent or aborted). Alias for `completed`.

### `locals: Record<string, any>`
Lazy-initialized object for middleware-to-middleware data passing. Created via `Object.create(null)`.

```ts
res.locals.requestId = nanoid()
```

### `raw: HttpResponse | null`
The underlying uWS `HttpResponse` object. `null` after the response is completed.

### `route: Route | null`
The matched `Route` instance for this request.

### `engine: EngineAdaptor | null`
Shortcut to `this.route?.engine`.

### `write_offset: number`
The current uWS write offset. Returns `-1` if the response is completed.

### `upgrade_socket: any`
The uWS upgrade socket handle. Only set for WebSocket upgrade requests.

### `sse: SSEventStream | undefined`
Server-Sent Events stream. Only available on GET requests. Returns `undefined` on non-GET methods. The stream is created lazily on first access.

---

## Status & Headers

### `status(code: number, message?: string): this`
Sets the HTTP status code and optional custom message. Returns `this` for chaining.

```ts
res.status(404)
res.status(201, "Created")
```

### `header(name: string, value: string | string[], overwrite?: boolean): this`
Sets a response header. If the header already exists and `overwrite` is `false`, values are accumulated as an array (e.g. for multiple `Set-Cookie`).

```ts
res.header("content-type", "application/json")
res.header("x-custom", "value")

// Multiple values:
res.header("set-cookie", "a=1")
res.header("set-cookie", "b=2")  // accumulated
```

### `setHeader(name: string, value: string): this`
Sets a header value with overwrite semantics (calls `header(name, value, true)` internally).

```ts
res.setHeader("x-custom", "final-value")
```

### `getHeader(name: string): string | string[] | undefined`
Returns the current value(s) of a header.

```ts
res.getHeader("content-type")  // "application/json"
```

### `removeHeader(name: string): void`
Removes a header from the response.

```ts
res.removeHeader("x-powered-by")
```

### `writeHeaders(headers: Record<string, any>): void`
Writes multiple headers at once from an object.

```ts
res.writeHeaders({
  "x-rate-limit": "100",
  "x-rate-remaining": "95",
})
```

### `setHeaders(headers: Record<string, any>): void`
Alias for `writeHeaders()`.

### `writeHeaderValues(name: string, values: string[]): void`
Writes multiple values for a single header.

```ts
res.writeHeaderValues("set-cookie", ["a=1", "b=2"])
```

### `get(name: string): string | undefined`
Returns the first value of a header (or the value itself if it's a string).

```ts
res.get("content-type")  // "application/json"
```

### `set(field: string | object, value?: any): this`
Sets headers using either `(key, value)` or `({ key: value })` syntax.

```ts
res.set("x-custom", "value")
res.set({ "x-foo": "bar", "x-baz": "qux" })
```

### `type(mime: string): this`
Sets the `Content-Type` header from a file extension or MIME string. Prefix with `.` for extension lookup.

```ts
res.type("json")        // application/json
res.type(".html")       // text/html
res.type("text/plain")  // text/plain
```

### `vary(name: string): this`
Sets the `Vary` header.

```ts
res.vary("Accept-Encoding")
```

### `location(path: string): this`
Sets the `Location` header.

```ts
res.location("/new-url")
```

### `links(links: Record<string, string>): this`
Sets the `Link` header from an object mapping `rel` → `URL`.

```ts
res.links({
  next: "/page/2",
  last: "/page/10",
})
// → Link: </page/2>; rel="next", </page/10>; rel="last"
```

### `append(name: string, values: string | string[]): this`
Appends values to a header. Alias for `header()` with no overwrite.

---

## Cookies

### `cookie(name, value, expiry?, options?, sign_cookie?): this`
Sets a `Set-Cookie` header. Auto-signs the value if `sign_cookie` is `true` (default) and `options.secret` is provided.

```ts
// Simple cookie with 1-hour expiry
res.cookie("session", token, 3600000)

// Secure cookie with signing
res.cookie("auth", token, 3600000, {
  secure: true,
  sameSite: "none",
  path: "/",
  httpOnly: true,
  secret: "my-secret",
})

// Delete a cookie (pass null value)
res.cookie("session", null)
```

Default options when not provided: `{ secure: true, sameSite: "none", path: "/" }`.

### `setCookie(name: string, value: any, options: any): this`
Sets a cookie without expiry. Shorthand for `cookie(name, value, null, options)`.

### `hasCookie(name: string): boolean`
Checks if a cookie with the given name has been queued for the response.

### `removeCookie(name: string): this`
Removes a cookie by setting it with `maxAge: 0`. Equivalent to `cookie(name, null)`.

### `clearCookie(name: string): this`
Alias for `removeCookie()`.

---

## Sending Responses

### `send(body?: any, close_connection?: boolean): this`
Sends the response and marks it as completed. Handles:
- Corked (batched) writes for efficiency
- `endWithoutBody` when a custom `content-length` header is set
- Streaming mode
- `finish` and `close` event dispatch

```ts
res.send("Hello World")
res.send({ data: [1, 2, 3] })
res.send()              // empty 200
res.send(null, true)    // close connection immediately
```

### `json(body: any): this`
Sets `Content-Type: application/json` and sends the body as a JSON string. Uses `JSON.stringify` internally.

```ts
res.json({ users: [...] })
res.json({ error: "Not found" })
```

### `html(body: any): this`
Sets `Content-Type: text/html` and sends the body.

```ts
res.html("<h1>Hello</h1>")
```

### `end(data?: any): this`
Alias for `send(data)`.

### `sendStatus(code: number): this`
Sends a response with only a status code and no body.

```ts
res.sendStatus(204)  // 204 No Content
res.sendStatus(404)  // 404 Not Found
```

### `redirect(url: string): boolean`
Sends a 302 redirect response. Returns `false` if already completed.

```ts
res.redirect("/login")
res.redirect("https://example.com")
```

### `close(): void`
Immediately closes the response connection (hard abort). Marks as completed and resolves the pending request counter.

```ts
res.close()
```

---

## Streaming

`Response` extends `stream.Writable` and supports chunked responses.

### `write(chunk: string): boolean`
Writes a chunk to the response body. Initiates headers on first call. Returns `false` under backpressure.

```ts
res.write("chunk1")
res.write("chunk2")
res.send()  // end the stream
```

### `stream(readable: Readable, total_size?: number): Promise<void>`
Streams a Node.js `Readable` to the client chunk by chunk. Handles backpressure via uWS drain. If `total_size` is provided, uses `tryEnd` for the final chunk.

```ts
const fileStream = fs.createReadStream("/path/to/file")
await res.stream(fileStream, stat.size)
```

### `drain(handler: (offset: number) => boolean): void`
Registers a drain handler for backpressure-aware streaming. The handler receives the current uWS write offset and must return `true` if the chunk was successfully written.

---

## Server-Sent Events (SSE)

### `sse: SSEventStream | undefined`
Access the SSE stream. Only available on GET requests. Returns `undefined` for other methods.

```ts
fn: (req, res) => {
  const stream = res.sse
  if (!stream) return

  stream.open()

  const timer = setInterval(() => {
    if (!stream.active) {
      clearInterval(timer)
      return
    }
    stream.send("message", JSON.stringify({ text: "hello" }))
  }, 1000)
}
```

**SSEventStream interface:**

```ts
interface SSEventStream {
  open(): boolean                                    // initiates the SSE connection
  close(): boolean                                   // closes the SSE connection
  comment(data: string): boolean                     // keep-alive comment (": ...")
  send(id: string, event: string, data: string): boolean
  send(event: string, data: string): boolean
  send(data: string): boolean
  readonly active: boolean                           // false when stream is dead
}
```

When the client disconnects:
- `stream.active` becomes `false`
- Subsequent `send()` calls return `false` instead of throwing
- Always check `stream.active` before writing in async loops

---

## Upgrade

### `upgrade(context?: any): void`
Upgrades the HTTP connection to a WebSocket. Only callable from an upgrade handler. Throws if `_upgrade_socket` is not set.

```ts
async handleWsUpgrade(context: any, token: string, res: any) {
  context.user = await validateToken(token)
  res.upgrade(context)
}
```

---

## Events

Response emits these events:

| Event | Description |
|-------|-------------|
| `abort` | Connection was aborted by client |
| `close` | Response was sent or connection closed |
| `finish` | Response body was fully sent |

```ts
res.on("finish", () => {
  console.log("Response sent")
})

res.on("abort", (req, res) => {
  console.log("Client disconnected")
})

res.on("close", (req, res) => {
  console.log("Connection closed")
})
```

### `on(event: string, handler: Function): this`
Registers an event listener.

### `once(event: string, handler: Function): this`
Registers an event listener that fires at most once.

### `off(event: string, handler: Function): this`
Removes an event listener.

### `listenerCount(event: string): number`
Returns the number of listeners for an event.

---

## Atomic Operations

### `atomic(handler: Function): this`
Wraps a handler in uWS `cork()` for batched writes. All writes inside the handler are sent in a single TCP segment.

```ts
res.atomic(() => {
  res.status(200)
  res.header("x-custom", "value")
  res.json({ ok: true })
})
```
