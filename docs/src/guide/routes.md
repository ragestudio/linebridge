# Routes & Handlers

Routes map HTTP methods and URL patterns to handler functions. Linebridge offers three ways to define routes, ordered from most idiomatic to most manual.

## 1. File-Based Routes (recommended)

The convention-over-configuration approach: drop `.ts, .js` files in the `routes/` directory and the framework discovers them automatically.

```
routes/
├── users/
│   ├── get.ts          → GET    /users
│   ├── post.ts         → POST   /users
│   └── [id]/
│       ├── get.ts      → GET    /users/:id
│       └── put.ts      → PUT    /users/:id
├── sse/
│   └── get.ts          → GET    /sse
└── health/
    └── get.ts          → GET    /health
```

Directory names in `[brackets]` become path parameters. `[$]` becomes a catch-all wildcard.

```ts
// routes/users/get.ts
import type MyAPI from "@/index"

export default defineRoute<MyAPI>()({
  useMiddlewares: ["auth"],
  useContexts: ["db"] as const,
  fn: async (req, res, ctx) => {
    const users = await ctx.db.users.find()
    return { users }
  },
})
```

Or simpler, export a plain function:

```ts
// routes/health/get.ts
export default async (req, res) => {
  return { status: "ok" }
}
```

See the [File-Based Routing guide](./file-based-routing) for full details on directory structure, path parameters, wildcards, and WebSocket event files.

## 2. Class-Based Routes (inline)

Define routes directly on the Server subclass using `defineRoute()`. Useful for small APIs or routes that need to reference server properties.

```ts
import { Server } from "linebridge"

export default class MyAPI extends Server {
  routes = {
    "/hi": defineRoute<MyAPI>()({
      method: "get",
      fn: async () => ({ message: "hello" }),
    }),
    "/events": defineRoute<MyAPI>()({
      method: "get",
      fn: (req, res) => {
        const stream = res.sse
        if (!stream) return
        stream.open()
        // keep-alive with stream.send(...)
      },
    }),
  }
}
```

## 3. Dynamic Routes (manual)

Instantiate the `Route` class directly and register it with `server.register.http()`. Useful for programmatic route generation (e.g. from a database or config file).

```ts
import { Route } from "linebridge"

// Define the route on onInitialize() or whatever can reach main server:
async onInitialize() {
  const route = new Route()
  route.path = "/users"
  route.method = "get"
  route.useMiddlewares = ["auth"]
  route.useContexts = ["db"]
  route.handler = async (req, res, ctx) => {
    return { users: await ctx.db.users.find() }
  }

  // Register the route with the engine
  this.engine.register(route)
}
```

or creating a extended `Route` class:

```ts
class MyRoute extends Route {
  path = "/users"
  method = "get"
  useMiddlewares = ["auth"]
  useContexts = ["db"]
  
  handler = async (req, res, ctx) => {
    return { users: await ctx.db.users.find() }
  }
}

this.engine.register(MyRoute)
```

When building routes dynamically from external data:

```ts
async onInitialize() {
  const endpoints = await loadEndpointsFromConfig()

  for (const ep of endpoints) {
    const route = new Route()
    route.path = ep.path
    route.method = ep.method
    route.handler = ep.handler
    route._initialize(this)
    this.engine.register(route)
  }
}
```

---

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

### Return Value Behavior

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

## Middleware Resolution

Middlewares can be specified by:

- **String name** — looked up in server's combined middlewares (`server.middlewares` + `server.base_middlewares`)
- **Function reference** — used directly

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
