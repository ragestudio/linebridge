# Middlewares

Middlewares are functions that execute in sequence before the route handler. They can modify the request/response, run side effects, or short-circuit the request.

## Middleware Signature

```ts
type MiddlewareHandlerFunction<TReq = Request, TRes = Response> = (
  req: TReq,
  res: TRes,
  next: () => void,
) => Promise<any>
```

- Call `next()` to pass control to the next middleware or the route handler
- If you **don't** call `next()`, the pipeline stops
- If the handler hasn't sent a response by the middleware's end, the pipeline auto-continues

## Defining Middlewares

Middlewares are defined on the `Server` subclass:

```ts
export default class MyAPI extends Server {
  middlewares = {
    auth: async (req, res, next) => {
      const token = req.headers["authorization"]
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" })
      }
      req.ctx.user = await validateToken(token)
      next()
    },

    rateLimit: async (req, res, next) => {
      const ip = req.ip
      const allowed = await checkRateLimit(ip)
      if (!allowed) {
        return res.status(429).json({ error: "Too many requests" })
      }
      next()
    },

    requestLogger: async (req, res, next) => {
      const start = Date.now()
      res.on("finish", () => {
        console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`)
      })
      next()
    },
  }
}
```

## Using Middlewares

### Global Middlewares

Apply to all routes via `useMiddlewares` in server config:

```ts
export default class MyAPI extends Server {
  static useMiddlewares = ["rateLimit", "requestLogger"]
}
```

### Route-Specific Middlewares

Apply to individual routes via `useMiddlewares`:

```ts
export default defineRoute<MyAPI>()({
  useMiddlewares: ["auth"],
  fn: async (req, res, ctx) => {
    // Only authenticated users reach here
  },
})
```

### Inline Middlewares

You can also pass middleware functions directly:

```ts
export default defineRoute<MyAPI>()({
  useMiddlewares: [
    "rateLimit",
    async (req, res, next) => {
      console.log("Inline middleware")
      next()
    },
  ],
  fn: async (req, res, ctx) => { /* ... */ },
})
```

## Execution Order

Middlewares execute in this sequence:

1. **Engine middlewares** - registered via `engine.register_middleware()` (base headers, base middlewares)
2. **Route middlewares** - specified in the route's `useMiddlewares` array

The execution is sequential within each layer.

## Built-in Middlewares

Linebridge ships with two built-in middlewares:

### `logs` (Logger)

Logs each request with method, status code, URL, and response time. Disabled in production (`NODE_ENV=production`).

```ts
// Enable globally
static useMiddlewares = ["logs"]
```

Output format:
```
[2024-01-01T00:00:00.000Z] GET 200 /api/users 12.34ms
```

### `cors` (CORS Handler)

Handles CORS preflight (`OPTIONS`) requests:

```ts
// Enable globally
static useMiddlewares = ["cors"]
```

Responds to `OPTIONS` requests with:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Credentials: true
```

Returns `204 No Content` for preflight requests.

## Base Middlewares

These are always available and registered automatically:

| Name | Implementation |
|------|---------------|
| `logs` | Logger middleware |
| `cors` | CORS handler |

## Middleware Composition

The `composeMiddlewares` utility resolves middleware names to functions and validates them:

```ts
import composeMiddlewares from "linebridge/utils/composeMiddlewares"

const resolved = composeMiddlewares(
  { auth: authFn, logs: loggerFn },  // available middlewares
  ["auth", "logs"],                    // selectors
)
// resolved = [authFn, loggerFn]
```

Throws if a named middleware is not found.

## Error Handling in Middlewares

Errors thrown in middlewares are caught by the Handler execution wrapper:

- `OperationError` → responds with the error's status code and message
- Other errors → responds with `500` and the error message

```ts
middlewares = {
  requireAdmin: async (req, res, next) => {
    if (!req.ctx.user?.isAdmin) {
      throw new OperationError(403, "Admin access required")
    }
    next()
  },
}
```

## Response Events in Middlewares

You can listen for response events to run code after the response is sent:

```ts
middlewares = {
  timing: async (req, res, next) => {
    res.on("finish", () => {
      console.log(`Response sent for ${req.url}`)
    })
    res.on("close", () => {
      console.log(`Connection closed for ${req.url}`)
    })
    res.on("abort", () => {
      console.log(`Request aborted: ${req.url}`)
    })
    next()
  },
}
```
