# Response API

The `Response` class represents the outgoing HTTP response. It extends `stream.Writable` and provides methods for setting status codes, headers, cookies, and sending various response types.

When using `defineRoute<MyAPI>()`, `res` is automatically typed with the engine-specific Response class (e.g. Neo engine), giving you access to all methods like `res.sse`, `res.cookie()`, `res.locals`, `res.file()`, etc.

## Import

```ts
// Response instances are created automatically by the engine.
// Available as the second parameter in route handlers and middlewares.
```

## Interface

```ts
interface Response {
  end(data?: any): this
  send(data?: any): this
  json(data: any): void
  status(code: number): Response
  header(name: string, value: string | string[], overwrite?: boolean): this
  setHeader(key: string, value: string): this
  completed: boolean
  _status_code?: number
  _responseTimeMs?: number
}
```

## Properties

### `completed: boolean`
Whether the response has been sent or the connection aborted.

### `initiated: boolean`
Whether response headers have been written.

### `_status_code: number`
The HTTP status code (default: 200).

### `_status_message: string | null`
Custom status message.

### `locals: Record<string, any>`
Lazy-initialized object for middleware-to-middleware data passing.

### `aborted: boolean`
Alias for `completed`.

### `route: Route | null`
The matched Route instance.

### `raw: HttpResponse | null`
The underlying uWebSockets.js `HttpResponse` object.

### `sse: SSEventStream | undefined`
Server-Sent Events stream (only available for GET requests).

### `write_offset: number`
Current write offset position. Returns `-1` if completed.

### `statusCode: number`
Getter/setter for the status code.

### `statusMessage: string | null`
Getter/setter for the status message.

### `headersSent: boolean`
Whether response headers have been sent (alias for `initiated`).

## Status & Headers

### `status(code: number, message?: string): this`
Sets the HTTP status code and optional message.

```ts
res.status(404)
res.status(201, "Created")
```

### `header(name: string, value: string | string[], overwrite?: boolean): this`
Sets a response header. Appends if the header already exists, unless `overwrite` is `true`.

```ts
res.header("content-type", "application/json")
res.header("set-cookie", ["a=1", "b=2"])
```

### `setHeader(name: string, value: string): this`
Alias for `header(name, value, true)` (overwrites).

### `writeHeaders(headers: Record<string, any>): void`
Writes multiple headers at once.

### `setHeaders(headers: Record<string, any>): void`
Alias for `writeHeaders`.

### `writeHeaderValues(name: string, values: any[]): void`
Writes multiple values for a single header.

### `getHeader(name: string): string | string[] | undefined`
Gets a header value.

### `removeHeader(name: string): void`
Removes a header.

### `get(name: string): string | string[] | undefined`
Alias for `getHeader`.

### `set(field: string | object, value?: any): this`
Sets header(s). Accepts either `(key, value)` or `({ key: value })`.

### `type(mime_type: string): this`
Sets the `Content-Type` header by MIME type or file extension.

```ts
res.type("json")        // application/json
res.type(".html")       // text/html
res.type("text/plain")  // text/plain
```

### `vary(name: string): this`
Sets the `Vary` header.

### `location(path: string): this`
Sets the `Location` header.

### `links(links: Record<string, string>): this`
Sets the `Link` header.

```ts
res.links({ next: "/page/2", last: "/page/10" })
```

## Cookies

### `cookie(name, value, expiry?, options?, sign_cookie?): this`
Sets a cookie. Auto-signs if `sign_cookie` is `true` and `options.secret` is provided.

```ts
res.cookie("session", token, 3600000, { httpOnly: true, secret: "my-secret" })
```

### `setCookie(name, value, options): this`
Sets a cookie without expiry.

### `hasCookie(name): boolean`
Checks if a cookie has been set.

### `removeCookie(name): this`
Removes a cookie by setting it with `maxAge: 0`.

### `clearCookie(name): this`
Alias for `removeCookie`.

## Sending Responses

### `send(body?: any, close_connection?: boolean): this`
Sends the response. Handles streaming, empty responses, and content-length.

### `json(body: any): this`
Sets `Content-Type: application/json` and sends JSON.

```ts
res.json({ users: [...] })
```

### `html(body: any): this`
Sets `Content-Type: text/html` and sends HTML.

### `jsonp(body: any, callback_name?: string): this`
Sends a JSONP response. Uses `callback` query parameter by default.

### `redirect(url: string): boolean`
Sends a 302 redirect. Returns `false` if already completed.

### `end(data?: any): this`
Alias for `send`.

### `sendStatus(code: number): this`
Sends a response with only a status code and no body.

### `close(): void`
Closes the connection without sending a response.

## File Responses

### `file(path: string, callback?: Function): this`
Sends a file. Uses `LiveFile` for automatic reloading on file changes (watches the file).

### `sendFile(path: string): this`
Alias for `file`.

### `attachment(path?: string, name?: string): this`
Sets `Content-Disposition: attachment` header. If path/name provided, includes filename.

### `download(path: string, filename?: string): this`
Combines `attachment` and `file` for file downloads.

## Streaming

`Response` extends `stream.Writable`:

### `stream(readable: stream.Readable, total_size?: number): Promise<void>`
Streams a Readable to the response. Handles backpressure.

### `write(chunk, encoding?, callback?): boolean`
Writes a chunk to the response body.

### `drain(handler: (offset: number) => boolean): void`
Registers a drain handler for backpressure management.

## Upgrade

### `upgrade(context?: any): void`
Upgrades the connection to WebSocket. Can only be called from an upgrade handler.

## Server-Sent Events

### `sse: SSEventStream | undefined`

Access the SSE stream (only available for GET requests). Returns `undefined` for non-GET methods.

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
    stream.send("message", JSON.stringify({ text: "hi!" }))
  }, 1000)
}
```

**SSEventStream interface:**

```ts
interface SSEventStream {
  open(): boolean           // initiates the SSE connection
  close(): boolean          // closes the SSE connection
  comment(data: string): boolean  // keep-alive comment (not emitted by EventSource)
  send(id: string, event: string, data: string): boolean
  send(event: string, data: string): boolean
  send(data: string): boolean
  readonly active: boolean  // whether the stream is still alive
}
```

When the client disconnects:
- `stream.active` becomes `false`
- subsequent `send()` calls return `false` instead of throwing
- always check `stream.active` before writing to avoid errors

## Events

Response emits these events:

| Event | Description |
|-------|-------------|
| `abort` | Connection was aborted by client |
| `close` | Response was sent or connection closed |
| `finish` | Response body was fully sent |

## Atomic Operations

### `atomic(handler: Function): this`
Batches multiple write operations into a single network call using uWS corking.

```ts
res.atomic(() => {
  res.header("x-custom", "value")
  res.status(200)
  res.json({ ok: true })
})
```
