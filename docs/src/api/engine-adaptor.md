# EngineAdaptor API

The `EngineAdaptor` class is the abstract base that all engines must extend. It defines the interface between the Server and the underlying HTTP/WS implementation.

## Import

```ts
import { EngineAdaptor } from "linebridge"
```

## Constructor

```ts
new EngineAdaptor(server: LinebridgeServer)
```

## Properties

### `server: LinebridgeServer`
Reference to the Server instance.

### `socket_path?: string`
Unix socket path when running in socket mode.

### `ws: any`
WebSocket handler instance (RTEngine), set by the engine if WS is enabled.

### `registers: Set<Record<string, string>>`
Set of all registered route `{ method, path }` pairs. Used for route discovery.

## Methods (must be implemented by engine)

### `register(route: Route<typeof this.server>): void`
Registers an HTTP route with the underlying server.

### `register_middleware(middleware: MiddlewareHandlerFunction): void`
Registers a global middleware with the engine.

### `initialize(): Promise<void>`
Called once during server startup. Set up the underlying server instance.

### `listen(): Promise<void>`
Start listening for connections.

### `close(): Promise<boolean>`
Gracefully close the server. Returns `true` on success.

## Dynamic Properties

The class supports dynamic property access via index signature:

```ts
[property: string]: any
```

This allows engines to attach additional properties and methods.
