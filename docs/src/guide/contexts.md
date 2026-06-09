# Context System

The context system provides a type-safe way to inject dependencies into route handlers. Contexts are resolved at route initialization time from the server's `contexts` and `base_contexts` objects.

## Defining Contexts

```ts
export default class MyAPI extends Server {
  contexts = {
    db: databaseConnection,
    cache: redisClient,
    config: { maxUploadSize: 10 * 1024 * 1024 },
    sum: (a: number, b: number) => a + b,
    sendEmail: async (to: string, subject: string, body: string) => {
      await emailService.send(to, subject, body)
    },
  }
}
```

Contexts can be any value: objects, functions, class instances, primitives.

## Built-in Contexts

The `base_contexts` object always includes:

```ts
base_contexts = {
  server: this,  // reference to the Server instance
}
```

So `ctx.server` is always available when requested.

## Using Contexts in Routes

Request specific contexts via `useContexts`:

```ts
export default defineRoute<MyAPI>()({
  useContexts: ["db", "sum", "server"] as const,
  fn: async (req, res, ctx) => {
    // ctx is typed as { db: Database, sum: Function, server: Server }
    const result = ctx.sum(5, 10)
    const users = await ctx.db.users.find()
    console.log(ctx.server.params.refName)
    return { result, users }
  },
})
```

The `as const` assertion preserves literal types for full type inference.

## Type Safety

The type system ensures you can only request contexts that exist:

```ts
defineRoute<MyAPI>()({
  useContexts: ["db", "nonexistent"], // TypeScript error!
  fn: async (req, res, ctx) => { /* ... */ },
})
```

The `ctx` parameter is automatically typed to include only the requested keys:

```ts
// With useContexts: ["db", "sum"]
// ctx type: { db: Database, sum: (a: number, b: number) => number }
```

## Resolution Mechanism

When a route is initialized, contexts are resolved:

```ts
// In Route._initialize():
const allContexts = Object.assign(
  {},
  this.server.contexts,
  this.server.base_contexts,
)

for (const key of this.useContexts) {
  if (key in allContexts) {
    this.ctx[key] = allContexts[key]
  }
}
```

Contexts are resolved **once** at route initialization, not per-request. This means:

- The same context instance is shared across all requests to that route
- If you need per-request values, use `req.ctx` (the request-local context) instead

## Request-Local Context (`req.ctx`)

In addition to injected contexts, each request has its own `req.ctx` object. Middlewares can attach values to it:

```ts
middlewares = {
  auth: async (req, res, next) => {
    req.ctx.user = await validateToken(req.headers["authorization"])
    next()
  },
}
```

The handler can then access it:

```ts
fn: async (req, res, ctx) => {
  const user = req.ctx.user  // set by middleware
  // ...
}
```

## Response Locals (`res.locals`)

Both `Request` and `Response` have `locals` objects for passing data between middlewares:

```ts
middlewares = {
  attachData: async (req, res, next) => {
    req.locals.startTime = Date.now()
    res.locals.requestId = nanoid()
    next()
  },
}
```

## Context Keys Type Helpers

```ts
import type { ContextsKeys, Contexts, Server } from "linebridge"

// Extract valid context key names
type MyKeys = ContextsKeys<MyAPI>
// "db" | "cache" | "config" | "sum" | "sendEmail" | "server"

// Extract full context type
type MyContexts = Contexts<MyAPI>
// { db: Database, cache: Redis, config: Config, sum: Function, ... }
```
