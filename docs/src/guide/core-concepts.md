# Core Concepts

## Architecture Overview

Linebridge follows a layered architecture where each component has a well-defined responsibility:

```
┌──────────────────────────────────────────┐
│               Your Server Class          │
│  (Contexts, Middlewares, Routes, Hooks)  │
├──────────────────────────────────────────┤
│              Route / Handler             │
│     (Path matching, execution pipeline)  │
├──────────────────────────────────────────┤
│               EngineAdaptor              │
│         (HTTP server abstraction)        │
├──────────────────────────────────────────┤
│          Neo Engine (uWebSockets)        │
│       (Raw HTTP/WS implementation)       │
└──────────────────────────────────────────┘
```

### Optional Layers

When running in distributed mode, additional components activate:

```
┌──────────────┐    NATS     ┌──────────────────┐
│  Gateway     │◄──────────►│  Service Instance │
│  (Router)    │             │  (IPC + NATS)     │
└──────────────┘             └──────────────────┘
```

## Lifecycle

When `server.run()` is called, the following sequence executes:

1. **Local address resolution** - determines the host's private IP
2. **Event bus setup** - registers declared events on the internal EventEmitter (`tseep`)
3. **NATS adapter** *(if gateway mode)* - connects to NATS and starts IPC
4. **Engine initialization** - constructs and configures the engine (Neo)
5. **`initialize` array** - executes all tasks in parallel
6. **`onInitialize()`** - user-defined async hook, fires before routes are registered
7. **Base headers & middlewares** - registers defaults
8. **WebSocket events** - if WS is enabled, registers declared events
9. **Class-based HTTP routes** - registers routes defined on the server class
10. **File-based HTTP routes** - recursively scans and registers route files
11. **File-based WS events** - recursively scans and registers WebSocket event files
12. **Base routes** - registers `/` and `/_map` endpoints
13. **Gateway registration** *(if gateway mode)* - announces service to gateway
14. **Plugin initialization** - loads and initializes plugins
15. **Engine listen** - starts accepting connections
16. **`afterInitialize()`** - user-defined async hook, fires after server is listening

## Engines

Engines are the transport layer. Linebridge ships with one engine:

### Neo Engine (default)

Based on **uWebSockets.js v20.68.0**, the Neo engine provides:

- HTTP/HTTPS server with automatic SSL detection
- WebSocket support with pub/sub via MQTT-style topics
- Unix socket mode for local IPC
- Body parsing (JSON, URL-encoded, multipart, raw Buffer, text)
- Server-Sent Events (SSE) support
- Streaming request/response bodies
- Chunked transfer encoding
- Automatic graceful shutdown on SIGINT/SIGTERM

To add a custom engine, implement the `EngineAdaptor` interface and register it in `src/engines/index.ts`.

## TypeScript Type Safety

Linebridge is built with TypeScript from the ground up. Key type features:

- **`defineRoute()`** - infers the server type and provides autocompletion for contexts, middlewares, and engine-specific Request/Response methods
- **`ServerRequest<T>` / `ServerResponse<T>`** - resolve engine-specific Request/Response types from a Server subclass
- **`ContextsKeys<T>`** - extracts valid context keys from a Server subclass
- **`MiddlewaresKeys<T>`** - extracts valid middleware keys from a Server subclass
- **`KnownKeys<T>`** - filters out index signatures to reveal explicit keys

Engine type inference is driven by the `Server<EngineType>` generic. Each engine provides its own Request/Response types, and `defineRoute()` automatically resolves them:

```ts
class MyAPI extends Server {  // defaults to EngineType = "neo"
  routes = {
    "/hi": defineRoute<MyAPI>()({
      fn: (req, res) => {
        res.sse       // ✅ typed as SSEventStream (Neo engine)
        req.sign("s")  // ✅ typed cookie signing (Neo engine)
      }
    })
  }
}
```

## Globals

Linebridge sets up several globals during initialization:

| Global | Description |
|--------|------------|
| `OperationError` | Error class for HTTP error responses |
| `defineRoute` | Type-safe route definition helper |
| `Boot(baseClass)` | Function to instantiate and run a server |
| `ToBoolean(value)` | Converts string/boolean to boolean |
| `__linebridge` | Internal reference to vars and params |
| `nats` | NATS adapter instance *(gateway mode)* |
| `ipc` | IPC client instance *(gateway mode)* |
