# Handler API

The `Handler` class wraps execution functions (route handlers, middlewares, WebSocket event handlers) and provides a unified execution interface with error handling.

## Import

```ts
import { Handler, HandlerKind } from "linebridge"
```

## `HandlerKind` Enum

```ts
enum HandlerKind {
  http = "http",
  ws = "ws",
  middleware = "middleware",
}
```

## Constructor

```ts
new Handler<K extends HandlerKind>(params: HandlerParamsByKind[K])
```

### `HandlerParamsByKind`

```ts
interface HandlerParamsByKind {
  [HandlerKind.http]: {
    kind: HandlerKind.http
    engine: EngineAdaptor
    fn: HttpHandlerFunction
  }
  [HandlerKind.ws]: {
    kind: HandlerKind.ws
    engine: EngineAdaptor
    fn: WebsocketHandlerFunction
  }
  [HandlerKind.middleware]: {
    kind: HandlerKind.middleware
    engine: EngineAdaptor
    fn: MiddlewareHandlerFunction
  }
}
```

## Properties

### `kind: K`
The handler kind (http, ws, or middleware).

### `engine: EngineAdaptor`
Reference to the engine instance.

### `fn: HandlerParamsByKind[K]["fn"]`
The wrapped function.

### `params: HandlerParamsByKind[K]`
The original constructor params.

### `_constructed: boolean`
Whether the handler was successfully constructed.

## Methods

### `execute(...args: any): Promise<void>`
Dispatches execution to the appropriate method based on `kind`. Catches and logs fatal errors.

#### HTTP Execution

```ts
private async executeAsHttp(req: Request, res: Response): Promise<void>
```

1. Calls the handler function with `(req, res, req.ctx)`
2. If the function returns a value and `res.completed` is false, auto-serializes as JSON
3. Catches `OperationError` - responds with status code and error message
4. Catches other errors - logs and responds with 500

#### Middleware Execution

```ts
private async executeAsMiddleware(req: Request, res: Response, next: () => void): Promise<void>
```

1. Calls the middleware function with `(req, res, next)`
2. Same error handling as HTTP execution

#### WebSocket Execution

```ts
private async executeAsWebsocket(client: Client, data?: any, ctx?: Record<string, any>): Promise<void>
```

1. Calls the WebSocket handler with `(client, data, ctx)`
2. Silently swallows `OperationError`
3. Logs other errors

## Exported Types

```ts
import type {
  HttpHandlerFunction,
  WebsocketHandlerFunction,
  MiddlewareHandlerFunction,
} from "linebridge"
```

### `HttpHandlerFunction`

```ts
type HttpHandlerFunction<TCtx = Record<string, any>> = (
  req: Request,
  res: Response,
  ctx: TCtx,
) => any
```

### `WebsocketHandlerFunction`

```ts
type WebsocketHandlerFunction<TCtx = Record<string, any>> = (
  client: WsClient,
  data?: any,
  ctx?: TCtx,
) => any
```

### `MiddlewareHandlerFunction`

```ts
type MiddlewareHandlerFunction<TReq = Request, TRes = Response> = (
  req: TReq,
  res: TRes,
  next: () => void,
) => Promise<any>
```
