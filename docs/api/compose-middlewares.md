# Compose Middlewares

Resolves middleware selectors (names or functions) into an array of middleware functions from a middleware record.

## Import

```ts
import composeMiddlewares from "linebridge/utils/composeMiddlewares"
```

## Signature

```ts
function composeMiddlewares(
  middlewares: Record<string, MiddlewareHandlerFunction>,
  selectors: Array<string | MiddlewareHandlerFunction>,
): MiddlewareHandlerFunction[]
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `middlewares` | `Record<string, MiddlewareHandlerFunction>` | Available middleware functions keyed by name |
| `selectors` | `Array<string \| MiddlewareHandlerFunction>` | Middleware names or functions to resolve |

## Returns

`MiddlewareHandlerFunction[]` - resolved middleware functions in order.

## Behavior

- For string selectors: looks up the function in the `middlewares` record
- For function selectors: uses the function directly
- Throws if a named middleware is not found
- If `middlewares` or `selectors` is falsy, returns `[]`

## Usage

```ts
const availableMiddlewares = {
  auth: authMiddleware,
  rateLimit: rateLimitMiddleware,
  logs: loggerMiddleware,
}

const selectors = ["auth", "logs", async (req, res, next) => {
  console.log("inline")
  next()
}]

const pipeline = composeMiddlewares(availableMiddlewares, selectors)
// pipeline = [authMiddleware, loggerMiddleware, inlineMiddleware]
```

## Internal Use

Used by `registerBaseMiddlewares()` to compose global middlewares from server config:

```ts
const middlewares = composeMiddlewares(
  { ...server.middlewares, ...Vars.baseMiddlewares },
  server.params.useMiddlewares,
)
```
