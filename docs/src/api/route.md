# Route API

The `Route` class represents an HTTP or WebSocket route. It manages path matching, middleware resolution, context injection, and handler wrapping.

## Import

```ts
import { Route } from "linebridge"
```

## Constructor

```ts
new Route<TServer, TContextKeys>()
```

Generic parameters:
- `TServer extends Server` - the server type
- `TContextKeys extends MiddlewaresKeys<TServer>[]` - context key array type

## Properties

### `server: TServer`
Reference to the server instance. Set during `_initialize()`.

### `kind: HandlerKind`
The kind of handler. Defaults to `HandlerKind.http`. Can also be `HandlerKind.ws`.

### `path: string`
URL path pattern. Defaults to `"/"`.

### `method: RouteHttpMethods`
HTTP method. Defaults to `"get"`.

```ts
type RouteHttpMethods = "any" | "get" | "post" | "put" | "delete" | "patch" | "options" | "head"
```

### `useContexts: ContextsKeys<TServer>[]`
Array of context keys to inject into the handler.

### `useMiddlewares: MiddlewaresKeys<TServer>[]`
Array of middleware names or functions to execute before the handler.

### `pathParametersKey: any`
Parsed path parameter metadata. Set automatically during initialization.

### `middlewares: Handler[]`
Resolved middleware Handler instances.

### `ctx: Record<string, any>`
Resolved context object injected into the handler.

### `handler: Handler`
The main route handler wrapped in a `Handler` instance.

### `engine` (getter)
Shortcut to `this.server.engine`.

### `streaming: any`
Streaming configuration for the route.

## Methods

### `_initialize(server: TServer, definitions?: Route): void`
Initializes the route by resolving contexts and middlewares from the server.

**Parameters:**
- `server` - the Server instance
- `definitions` - optional Route-like object with `path`, `method`, `useContexts`, `useMiddlewares`, `handler`

**Flow:**
1. Copies `path`, `method`, `useContexts`, `useMiddlewares` from definitions
2. Parses path parameters via `parsePathParameters()`
3. Merges `server.contexts` + `server.base_contexts`
4. Resolves requested contexts by key
5. Merges `server.middlewares` + `server.base_middlewares`
6. Resolves middlewares by string lookup or direct function
7. Wraps handler in a `Handler<HandlerKind.http>` instance
8. Wraps each middleware in a `Handler<HandlerKind.middleware>` instance

### `_to_handler(obj: any, kind: HandlerKind): Handler | null`
Wraps a function in a `Handler` instance of the specified kind.

## `defineRoute()`

A type-safe route definition helper. It infers the Server subclass to provide:
- Engine-specific `req` and `res` types (e.g. Neo engine methods like `res.sse`, `req.sign()`)
- Autocompletion for `useMiddlewares` and `useContexts`
- Narrowed `ctx` type based on selected contexts

### Signature

```ts
function defineRoute<
  Child extends Server,
  Type extends RouteTypes = "http",
>(): <
  UseContexts extends readonly ContextsKeys<Child>[] = readonly [],
>(route: {
  method?: RouteHttpMethods
  useMiddlewares?: MiddlewaresKeys<Child>[]
  useContexts?: UseContexts
  fn: Type extends "ws"
    ? WebsocketHandlerFunction<Pick<Contexts<Child>, UseContexts[number]>>
    : HttpHandlerFunction<
        Pick<Contexts<Child>, UseContexts[number]>,
        ServerRequest<Child>,
        ServerResponse<Child>
      >
}) => typeof route
```

### Usage

```ts
import API from "@/index"

export default defineRoute<API>()({
  useMiddlewares: ["logs"],
  useContexts: ["server"] as const,
  fn: (req, res, ctx) => {
    // req, res → Neo engine types (sse, sign, cookie, locals, etc.)
    // ctx.server → fully typed Server instance
    return ctx.server.params
  },
})
```

## Route Types

```ts
type RouteTypes = "http" | "ws"

interface RouteObject<Child, SelectedCtx, Type> {
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

## HttpHandlerFunction

```ts
type HttpHandlerFunction<
  TCtx = Record<string, any>,
  TReq extends Request = Request,
  TRes extends Response = Response,
> = (req: TReq, res: TRes, ctx: TCtx) => any
```

## Type Exports

```ts
import type {
  RouteTypes,
  RouteHttpMethods,
  RouteObject,
  defineRoute,
} from "linebridge"
```
