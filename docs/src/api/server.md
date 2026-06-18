# Server API

The `Server` class is the foundation of every Linebridge application. It manages configuration, lifecycle, engine initialization, route registration, middleware composition, and plugin loading.

## Import

```ts
import { Server } from "linebridge"
```

## Constructor

```ts
new Server(params?: ConstructorParams)
```

### `ConstructorParams`

All properties are optional and merge with defaults from `Vars.defaultParams`.

```ts
type ConstructorParams = Partial<ServerParams>
```

### `ServerParams`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `refName` | `string` | `"linebridge"` | Unique name for this service |
| `listenIp` | `string` | `"0.0.0.0"` | IP to bind to |
| `listenPort` | `number` | `3000` | Port to listen on |
| `useEngine` | `string` | `"neo"` | Engine name |
| `websockets` | `boolean \| WebsocketParams` | `false` | WebSocket configuration |
| `nats` | `NatsParams \| null` | `null` | NATS connection config |
| `baseRoutes` | `boolean` | `true` | Register `/` and `/_map` |
| `routesPath` | `string` | `path.resolve(cwd, "routes")` | HTTP file routes directory |
| `wsRoutesPath` | `string` | `path.resolve(cwd, "ws_routes")` | WS file events directory |
| `useMiddlewares` | `Array<string \| MiddlewareHandlerFunction>` | `[]` | Global middlewares |
| `httpMethods` | `string[]` | `["get","post","put","patch","del","delete","trace","head","any","options","ws"]` | Supported methods |

## Static Properties

Static properties on a Server subclass override the corresponding params:

```ts
class MyServer extends Server {
  static refName?: string
  static useEngine?: string
  static listenIp?: string
  static listenPort?: string | number
  static websockets?: boolean | WebsocketParams
  static nats?: NatsParams
  static baseRoutes?: boolean
  static routesPath?: string
  static wsRoutesPath?: string
  static useMiddlewares?: Array<string | MiddlewareHandlerFunction>
}
```

## Properties

### `params: ServerParams`
Resolved configuration (defaults merged with constructor params, then overridden by static properties).

### `eventBus: EventEmitter`
Internal event emitter (`tseep`). Events declared in `this.events` are automatically registered on the bus.

### `engine: EngineAdaptor`
The active engine instance. Set during `run()`.

### `nats: NatsAdapter | null`
NATS adapter instance. Only available in gateway mode.

### `ipc: IPC | null`
IPC client instance. Only available in gateway mode.

### `plugins: Map<string, ServerPlugin>`
Map of registered plugins (plugin name → instance).

### `localAddress: string`
Resolved local private IP address.

### `ssl: { key: string; cert: string }`
SSL key and certificate file paths. Must be set before `run()`.

### `headers: Record<string, string>`
Custom headers to add to every response.

### `contexts: Record<string, any>`
Injectable contexts for route handlers.

### `middlewares: Record<string, MiddlewareHandlerFunction>`
Named middleware functions.

### `routes: Record<string, any>`
Inline route definitions.

### `wsEvents: Record<string, WebsocketHandlerFunction>`
Inline WebSocket event definitions.

### `ipcEvents: IPCEvents`
IPC event handlers for inter-service communication.

### `events: Record<string, Function>`
Custom event handlers registered on `eventBus`.

### `initialize: Array<() => Promise<void>>`
Array of async initialization tasks (run in parallel before `onInitialize`).

## Computed Properties

### `experimental: boolean`
Returns `true` if running an experimental build (`.experimental` file exists in lib root).

### `hasSSL: boolean`
Returns `true` if both `ssl.key` and `ssl.cert` are defined.

## Lifecycle Methods (override in subclass)

### `onInitialize(): Promise<void>`
Called before routes are registered and the server listens. Use for database connections, config loading, etc.

### `afterInitialize(): Promise<void>`
Called after the server is listening. Use for startup notifications, health checks, etc.

### `onClose(): void`
Called during server shutdown. Use for cleanup.

## WebSocket Hooks (override in subclass)

### `handleWsUpgrade(context: any, token: string, res: any): Promise<void>`
Called during WebSocket upgrade. Validate tokens, set user context, then call `res.upgrade(context)`.

### `handleWsConnection(socket: any): Promise<void>`
Called when a WebSocket connection is opened.

### `handleWsDisconnect(socket: any, client?: any): Promise<void>`
Called when a WebSocket connection is closed.

## Methods

### `run(): Promise<void>`
Starts the server. Executes the full lifecycle: engine init → hooks → route registration → listen.

```ts
const server = new MyServer()
await server.run()
```

### `_fireClose(): void`
Internal. Fires `onClose` hook and closes the engine.

## Base Contexts

Always available contexts:

```ts
base_contexts = {
  server: Server  // reference to this Server instance
}
```

## Base Middlewares

Always available middleware names:

```ts
base_middlewares = {
  logs: LoggerMiddleware,
  cors: CorsMiddleware,
}
```

## Type Helpers

```ts
import type {
  ServerParams,
  ConstructorParams,
  ServerLike,
  ExtendedServer,
  ContextsKeys,
  MiddlewaresKeys,
  Contexts,
  ServerRequest,
  ServerResponse,
  IPCEventFn,
  IPCEvents,
  ServerPlugin,
} from "linebridge"
```

### `ServerRequest<T>` and `ServerResponse<T>`

Resolve the engine-specific Request/Response types for a Server subclass. When using `defineRoute()`, these are automatically inferred — no manual imports needed.

```ts
import type { ServerRequest, ServerResponse } from "linebridge"
import type MyAPI from "@/index"

type MyReq = ServerRequest<MyAPI>   // NeoRequest<MyAPI>
type MyRes = ServerResponse<MyAPI>  // NeoResponse<MyAPI>
```

These types map the `EngineType` generic (default: `"neo"`) to the corresponding engine's Request/Response classes, exposing all engine-specific methods like `res.sse`, `req.sign()`, `res.cookie()`, etc.

## EngineType Generic

The `Server` class accepts an optional `EngineType` generic parameter that controls which engine's Request/Response types are inferred by `defineRoute()`:

```ts
class Server<EngineType = "neo"> { ... }
```

When extending `Server`, the default `"neo"` engine is used. To use a custom engine:

```ts
class MyAPI extends Server<"fastify"> {
  // req/res in defineRoute<MyAPI>() will use Fastify types
}
```
