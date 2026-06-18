# Request API

The `Request` object represents an incoming HTTP request. It wraps a raw uWS `HttpRequest` and provides high-level access to headers, body parsing, cookies, IP resolution, path/query parameters, and cookie signing.

When using `defineRoute<MyAPI>()`, `req` is fully typed with the engine-specific `Request` class, giving you access to all methods.

## Import

```ts
// Request instances are created automatically by the engine.
// Available as the first parameter in route handlers and middlewares.
```

## Properties

### `method: string`
HTTP method, normalized to uppercase. E.g., `"GET"`, `"POST"`. uWS uses `"del"` internally, which is normalized to `"DELETE"`.

```ts
fn: (req, res) => {
  if (req.method === "POST") { /* ... */ }
}
```

### `url: string`
Full URL including query string. Lazily composed on first access.

```ts
// GET /users?page=1&limit=10
req.url  // "/users?page=1&limit=10"
```

### `path: string`
URL path without query string.

```ts
// GET /users/42?tab=profile
req.path  // "/users/42"
```

### `headers: Record<string, string>`
Request headers as a plain object. All keys are lowercase (uWS normalizes them).

```ts
req.headers["content-type"]   // "application/json"
req.headers["authorization"]  // "Bearer abc123"
```

Headers are captured synchronously at request creation time — the uWS `HttpRequest` is invalid after the first `await`.

### `params: Record<string, any>`
Path parameters extracted from the route pattern.

```ts
// Route: "/users/:userId/posts/:postId"
// Request: GET /users/42/posts/7
req.params.userId  // "42"
req.params.postId  // "7"
```

### `query: Record<string, any>`
Parsed query string parameters (via `fast-querystring`). Lazily parsed on first access.

```ts
// GET /search?q=hello&page=1
req.query.q     // "hello"
req.query.page  // "1"
```

### `cookies: Record<string, string>`
Parsed cookies from the `Cookie` header. Lazily parsed on first access.

```ts
req.cookies.session    // "abc123"
req.cookies["theme"]   // "dark"
```

### `body: any`
Parsed request body. Available after calling `parseBody()` or any body-consuming method. Populated lazily — the first body-consuming call triggers parsing.

### `ip: string`
Resolved remote IP address. When `trust_proxy` is enabled, reads from `X-Forwarded-For` header (takes the first IP in the chain). Otherwise uses uWS's direct remote address.

```ts
req.ip  // "192.168.1.42"
```

### `proxy_ip: string`
The proxy IP as reported by uWS (`getProxiedRemoteAddressAsText()`). Available regardless of `trust_proxy` setting.

### `ctx: Record<string, any>`
Request-local context object. Set to the route's resolved contexts at creation time (`route.ctx`). Middlewares can attach additional data here for downstream handlers.

```ts
// In middleware:
req.ctx.user = await validateToken(token)

// In handler:
const user = req.ctx.user
```

### `locals: Record<string, any>`
Lazy-initialized object for middleware-to-middleware data passing. Created via `Object.create(null)` — no prototype pollution risk.

```ts
// Middleware A:
req.locals.startTime = Date.now()

// Middleware B:
const elapsed = Date.now() - req.locals.startTime
```

### `raw: HttpRequest`
The underlying uWS `HttpRequest` object. Headers from this object are **invalid after the first await** — use `req.headers` instead.

### `route: Route | null`
The matched `Route` instance for this request.

### `engine: EngineAdaptor | null`
Shortcut to `this.route?.engine`. The engine that owns this request.

### `paused: boolean`
Whether the underlying response stream is currently paused (e.g. during backpressure-limited body buffering).

---

## Body Parsing Methods

Body parsing is **lazy** — the body is only read from the wire when you call one of these methods. The engine starts buffering body chunks automatically on requests with a body (non-GET/HEAD/OPTIONS/TRACE), so by the time you call a body method, the data is usually already available.

### `parseBody(): Promise<any>`
Auto-detects `Content-Type` and parses accordingly. This is the main entry point — all other body methods call it internally.

| Content-Type header contains | Parsed as |
|------------------------------|-----------|
| `application/json` | `JSON.parse()` → object (falls back to `{}` on parse error) |
| `application/x-www-form-urlencoded` | URL-encoded → object |
| `multipart/form-data` | Raw Buffer (not auto-parsed) |
| `text/*`, `application/xml`, `application/javascript` | UTF-8 string |
| Missing / unknown | UTF-8 string |

```ts
const body = await req.parseBody()
// body type depends on Content-Type
```

### `json(default_value?): Promise<any>`
Parses the body as JSON. If parsing fails and `default_value` is provided, returns it instead of throwing.

```ts
const data = await req.json()             // throws on invalid JSON
const data = await req.json({ ok: true }) // returns default on error
```

### `text(): Promise<string>`
Returns the body as a UTF-8 string.

```ts
const raw = await req.text()
```

### `urlencoded(): Promise<any>`
Parses the body as URL-encoded form data.

```ts
const form = await req.urlencoded()
// { username: "john", password: "secret" }
```

### `buffer(): Promise<Buffer>`
Returns the raw body as a `Buffer`.

```ts
const raw = await req.buffer()
```

---

## Cookie Signing

### `sign(value: string, secret: string): string`
Signs a value using `cookie-signature`. Returns the signed string.

```ts
const signed = req.sign("my-value", "my-secret")
// "my-value.HASH"
```

### `unsign(signed: string, secret: string): string | undefined`
Unsigns a signed value. Returns the original string, or `undefined` if the signature is invalid.

```ts
const original = req.unsign("my-value.HASH", "my-secret")
// "my-value" | undefined
```

---

## Stream Control

`Request` extends `stream.Readable` — all Node.js stream methods are available.

### `pause(): this`
Pauses the underlying uWS response stream (applies backpressure).

### `resume(): this`
Resumes the underlying uWS response stream.

### `pipe<T>(destination, options?): this`
Pipes the request body to a writable stream.

```ts
req.pipe(fs.createWriteStream("/tmp/upload.bin"))
```

---

## Body Size Limits

Configured via engine options:

| Option | Default | Description |
|--------|---------|-------------|
| `max_body_buffer` | 16 KB | Buffer threshold before backpressure kicks in |
| `max_body_length` | 9 MB | Hard limit — exceeding triggers 413 "Payload Too Large" |

These are set on the engine, not per-request:

```ts
// In the Neo engine constructor:
options: {
  max_body_buffer: 16 * 1024,
  max_body_length: 9 * 1024 * 1024,
}
```
