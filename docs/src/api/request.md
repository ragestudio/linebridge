# Request API

The `Request` class represents an incoming HTTP request. It extends `stream.Readable` and provides methods for accessing headers, body, query parameters, path parameters, cookies, and IP information.

When using `defineRoute<MyAPI>()`, `req` is automatically typed with the engine-specific Request class (e.g. Neo engine), giving you access to all methods like `req.sign()`, `req.unsign()`, `req.buffer()`, `req.locals`, etc.

## Import

```ts
// Request instances are created automatically by the engine.
// Available as the first parameter in route handlers and middlewares.
```

## Interface

```ts
interface Request {
  url: string
  method: string
  path: string
  cookies: Record<string, string>
  ip: string
  headers: Record<string, any>
  body: any
  params: Record<string, any>
  query: Record<string, any>
  ctx: Record<string, any>
  raw: any

  text(): Promise<string>
  json(): Promise<Record<any, any>>
  urlencoded(): Promise<Record<any, any>>
}
```

## Properties

### `method: string`
HTTP method (uppercase). E.g., `"GET"`, `"POST"`, `"DELETE"`.

### `url: string`
Full URL including query string. E.g., `"/users?page=1"`.

### `path: string`
URL path without query string. E.g., `"/users"`.

### `headers: Record<string, string>`
Request headers object. Keys are lowercase.

### `params: Record<string, any>`
Path parameters extracted from the route pattern. E.g., `{ userId: "42" }` for `/users/:userId`.

### `query: Record<string, any>`
Parsed query string parameters. E.g., `{ page: "1", limit: "10" }`.

### `cookies: Record<string, string>`
Parsed cookies from the `Cookie` header.

### `body: any`
Parsed request body. Available after calling `parseBody()` or a body parsing method.

### `ip: string`
Client IP address. Respects `X-Forwarded-For` header if `trust_proxy` is enabled.

### `proxy_ip: string`
Proxied remote address (the actual upstream proxy IP).

### `ctx: Record<string, any>`
Request-local context. Middlewares can attach data here for downstream handlers.

### `locals: Record<string, any>`
Lazy-initialized object for middleware-to-middleware data passing.

### `raw: HttpRequest`
The underlying uWebSockets.js `HttpRequest` object.

### `route: Route | null`
The matched Route instance.

### `received: boolean`
Whether the full request body has been received.

### `paused: boolean`
Whether the request stream is paused.

## Body Parsing Methods

### `parseBody(): Promise<any>`
Automatically detects content type and parses accordingly:

| Content-Type | Method used |
|-------------|-------------|
| `application/json` | `json()` |
| `application/x-www-form-urlencoded` | `urlencoded()` |
| `multipart/form-data` | returns `undefined` (use `multipart()`) |
| `text/*`, `application/xml`, `application/javascript` | `text()` |
| Unknown / missing | `text()` |

### `json(default_value?): Promise<any>`
Parses the body as JSON. If parsing fails, returns `default_value` if provided, otherwise throws.

### `text(): Promise<string>`
Returns the body as a UTF-8 string.

### `urlencoded(): Promise<Record<any, any>>`
Parses the body as URL-encoded form data.

### `buffer(): Promise<Buffer>`
Returns the raw body as a Buffer.

### `multipart(options?, handler?): Promise<void>`
Processes multipart form data using `busboy`. The handler receives `MultipartField` objects.

```ts
await req.multipart(async (field) => {
  if (field.file) {
    await field.file.stream.pipe(fs.createWriteStream(field.file.name))
  } else {
    console.log(field.name, field.value)
  }
})
```

## Cookie Methods

### `sign(string, secret): string`
Signs a cookie value using `cookie-signature`.

### `unsign(signed_value, secret): string | undefined`
Unsigns a signed cookie value. Returns `undefined` if invalid.

## Stream Methods

`Request` extends `stream.Readable`, so all Node.js stream methods are available:

### `pipe<T>(destination, options?): this`
Pipes the request body to a writable stream.

### `pause(): this`
Pauses the request stream.

### `resume(): this`
Resumes the request stream.
