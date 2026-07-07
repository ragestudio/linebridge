# Request Object

The `req` object is the first parameter in every route handler and middleware. It wraps the raw uWS `HttpRequest` and gives you access to everything about the incoming request: method, URL, headers, body, cookies, path/query params, and IP information.

## Anatomy of a Request

```ts
export default defineRoute<MyAPI>()({
  fn: async (req, res, ctx) => {
    // req.method   → "GET" | "POST" | ...
    // req.url      → "/users?page=1"
    // req.path     → "/users"
    // req.query    → { page: "1" }
    // req.params   → { id: "42" }
    // req.headers  → { "content-type": "application/json", ... }
    // req.body     → { name: "John" }  (after parsing)
    // req.cookies  → { session: "abc123" }
    // req.ip       → "192.168.1.42"
    // req.ctx      → route contexts + middleware data
    // req.locals   → shared middleware storage
  },
})
```

## Path & Query Parameters

Parameters come from the route pattern and the query string:

```ts
// Route: "/users/:userId/posts/:postId"
// Request: GET /users/42/posts/7?format=compact

fn: (req, res) => {
  req.params.userId   // "42"
  req.params.postId   // "7"
  req.query.format    // "compact"
}
```

Query string parsing uses `fast-querystring` — lazy, only parsed on first access to `req.query`.

## Headers

All header keys are lowercase (uWS normalizes them). Headers are captured synchronously at request creation time.

```ts
fn: (req, res) => {
  const contentType = req.headers["content-type"]
  const auth = req.headers["authorization"]

  if (!auth) {
    return res.status(401).json({ error: "Missing authorization" })
  }
}
```

The raw uWS `HttpRequest` is invalid after the first `await` — always use `req.headers`, never `req.raw.forEach()` inside async handlers.

## Body Parsing

Body parsing is lazy. The engine buffers chunks automatically, but the body is only decoded when you first access it.

### Auto-detect with `parseBody()`

```ts
fn: async (req, res) => {
  const body = await req.parseBody()
  // Parsed based on Content-Type:
  //   application/json          → object
  //   x-www-form-urlencoded     → object
  //   text/plain                → string
  //   multipart/form-data       → Buffer
}
```

### Specific format methods

```ts
// JSON — returns default value if parsing fails
const data = await req.json({ default: true })

// URL-encoded form data
const form = await req.urlencoded()

// Raw text
const raw = await req.text()

// Raw Buffer
const buffer = await req.buffer()
```

### Body Size Limits

| Option | Default | Behavior |
|--------|---------|----------|
| `max_body_buffer` | 16 KB | Pauses the stream (backpressure) when buffered data exceeds this |
| `max_body_length` | 9 MB | Returns 413 "Payload Too Large" when total body exceeds this |

Both are engine-level options, not per-route.

## Cookies

Cookies are parsed lazily via the `cookie` package:

```ts
fn: (req, res) => {
  const session = req.cookies.session
  const theme = req.cookies.theme || "light"
}
```

### Signing & Unsigning Cookies

```ts
// Sign a value before setting it on the response
const signed = req.sign("my-value", "my-secret")
res.cookie("token", signed, 3600000)

// Unsign a value when reading it back
const original = req.unsign(req.cookies.token, "my-secret")
if (!original) {
  // signature invalid — reject
}
```

## Client IP

```ts
fn: (req, res) => {
  req.ip        // "192.168.1.42" — the client IP
  req.proxy_ip  // "10.0.0.1"     — the proxy IP (always available)
}
```

When `trust_proxy` is enabled on the engine, `req.ip` reads from `X-Forwarded-For` header (taking the first IP in the chain). Otherwise, it uses uWS's direct remote address.

Enable `trust_proxy` on the Neo engine:

```ts
// In the engine options (advanced):
options: { trust_proxy: true }
```

## Request-Local Storage

Two separate storage objects for sharing data between middlewares and handlers:

### `req.ctx` — Route contexts + middleware data

Set at request creation time from the route's resolved contexts. Middlewares can attach additional data:

```ts
middlewares = {
  auth: async (req, res, next) => {
    req.ctx.user = await validateToken(req.headers["authorization"])
    next()
  },
}

// In the handler:
fn: (req, res) => {
  const user = req.ctx.user    // set by auth middleware
  const server = req.ctx.server // base context
}
```

### `req.locals` — Middleware-to-middleware data

Created lazily via `Object.create(null)`. Use for transient data that should not pollute `ctx`:

```ts
middlewares = {
  timing: async (req, res, next) => {
    req.locals.startTime = Date.now()
    next()
  },
  logger: async (req, res, next) => {
    res.on("finish", () => {
      const elapsed = Date.now() - req.locals.startTime
      console.log(`${req.method} ${req.url} — ${elapsed}ms`)
    })
    next()
  },
}
```

## Stream Control

`Request` extends `stream.Readable`. You can pipe the request body:

```ts
fn: async (req, res) => {
  const writeStream = fs.createWriteStream("/tmp/upload.bin")
  req.pipe(writeStream)

  writeStream.on("finish", () => {
    res.json({ ok: true })
  })
}
```

Or pause/resume for backpressure control:

```ts
req.pause()   // pause the underlying response stream
req.resume()  // resume
```

## TypeScript

When using `defineRoute<MyAPI>()`, `req` is typed as the engine-specific Request class:

```ts
defineRoute<MyAPI>()({
  fn: (req, res, ctx) => {
    // req: NeoRequest<MyAPI>
    req.sign("val", "secret")    // ✅ typed
    req.unsign("val", "secret")  // ✅ typed
    req.buffer()                 // ✅ typed → Promise<Buffer>
  },
})
```
