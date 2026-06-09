# Routes & Handlers

Routes map HTTP methods and URL patterns to handler functions. Linebridge provides a class-based `Route` system with type-safe definition helpers.

## Defining Routes

### Using `defineRoute()` (Recommended)

The `defineRoute()` function provides full TypeScript type inference:

```ts
import { defineRoute } from "linebridge"
import type MyAPI from "@/index"

export default defineRoute<MyAPI>()({
  useMiddlewares: ["auth"],
  useContexts: ["db", "config"] as const,
  fn: async (req, res, ctx) => {
    // req, res → fully typed with engine-specific methods
    // ctx → narrowed to { db, config }
    const users = await ctx.db.users.find()
    return { users }
  },
})
```

The generic `<MyAPI>` enables:
- **Engine-specific types**: `req` and `res` get methods from the active engine (e.g. `res.sse`, `req.sign()` with Neo)
- **Autocompletion**: `useMiddlewares` and `useContexts` based on your server's declarations
- **Context narrowing**: `ctx` is narrowed to only the selected contexts

### Using the `Route` Class Directly

```ts
import { Route } from "linebridge"

const route = new Route()
route.path = "/users"
route.method = "get"
route.useMiddlewares = ["auth"]
route.useContexts = ["db"]
route.handler = async (req, res, ctx) => {
  return { users: await ctx.db.users.find() }
}
```

## Route Object Shape

```ts
interface RouteObject<Child extends Server, SelectedCtx, Type> {
  method?: RouteHttpMethods
  useMiddlewares?: MiddlewaresKeys<Child>[]
  useContexts?: readonly SelectedCtx[]
  fn: Type extends "ws"
    ? WebsocketHandlerFunction<Pick<Contexts<Child>, SelectedCtx>>
    : HttpHandlerFunction<
        Pick<Contexts<Child>, SelectedCtx>,
        ServerRequest<Child>,
        ServerResponse<Child>
      >
}
```

## HTTP Methods

Supported HTTP methods:

| Method | RouteHttpMethods | Notes |
|--------|-----------------|-------|
| GET | `"get"` | |
| POST | `"post"` | |
| PUT | `"put"` | |
| PATCH | `"patch"` | |
| DELETE | `"delete"` | Normalized to `"del"` for uWS compatibility |
| OPTIONS | `"options"` | |
| HEAD | `"head"` | |
| ANY | `"any"` | Matches all methods |

The special `"any"` method creates a catch-all route. The framework automatically maps `"delete"` to `"del"` internally.

## Path Parameters

Use colon-prefixed segments to capture URL parameters:

```
/users/:userId/posts/:postId
```

Parameters are available via `req.params`:

```ts
fn: async (req, res) => {
  const { userId, postId } = req.params
  // GET /users/42/posts/7 => { userId: "42", postId: "7" }
}
```

## Wildcard Routes

Use `*` in path definitions to match any segment:

```ts
route.path = "/files/*"
// Matches: /files/photo.jpg, /files/docs/report.pdf, etc.
```

## Handler Function

### HTTP Handler Signature

```ts
type HttpHandlerFunction<
  TCtx = Record<string, any>,
  TReq extends Request = Request,
  TRes extends Response = Response,
> = (
  req: TReq,
  res: TRes,
  ctx: TCtx,
) => any
```

When using `defineRoute<MyAPI>()`, `req` and `res` are automatically resolved to the engine-specific types (e.g. Neo engine methods like `res.sse`, `req.sign()`).

The return value is automatically serialized as JSON if the response hasn't been sent yet:

```ts
fn: async (req, res, ctx) => {
  // Returning an object auto-sends it as JSON
  return { hello: "world" }
}

fn: async (req, res, ctx) => {
  // Manual response control
  res.status(201).json({ created: true })
}

// SSE: no return value, stream stays open
fn: (req, res) => {
  const stream = res.sse
  if (!stream) return
  stream.open()
}
```

## Route Initialization

When a route is registered, `Route._initialize()` performs:

1. Copies `path`, `method`, `useContexts`, `useMiddlewares` from definitions
2. Parses path parameters from the route pattern
3. Resolves contexts from the server's `contexts` and `base_contexts`
4. Resolves middlewares from the server's `middlewares` and `base_middlewares`
5. Wraps the handler function in a `Handler` instance

## Middleware Resolution

Middlewares can be specified by:

- **String name** - looked up in server's combined middlewares (`server.middlewares` + `server.base_middlewares`)
- **Function reference** - used directly

```ts
route.useMiddlewares = [
  "auth",                                // lookup by name
  async (req, res, next) => { next() },  // inline function
]
```

Each middleware is wrapped in a `Handler<HandlerKind.middleware>` instance for consistent execution.

## Context Resolution

Contexts are resolved from:

1. `server.contexts` (user-defined)
2. `server.base_contexts` (built-in: `{ server }`)

Only the keys listed in `useContexts` are injected into the handler's `ctx` parameter:

```ts
// Server defines:
contexts = { db: connection, cache: redisClient }

// Route requests only "db":
useContexts: ["db"]
// Handler receives: ctx = { db: connection }
```

## Handler Execution Pipeline

For each incoming request:

1. The engine constructs `Request` and `Response` objects
2. Body parsing runs if content is present (JSON, URL-encoded, multipart, text)
3. Global engine middlewares execute in order
4. Route-specific middlewares execute in order
5. The route handler executes
6. If no response was sent, the handler's return value is serialized as JSON

Errors thrown during execution are caught:
- `OperationError` instances return their status code and message
- Unhandled errors return `500` with the error message
