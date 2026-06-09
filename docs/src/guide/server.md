# Server

The `Server` class is the foundation of every Linebridge application. You extend it to create your API.

## Basic Usage

```ts
import { Server } from "linebridge"

export default class MyAPI extends Server {
  static refName = "my-api"
  static listenPort = 3000
}

Boot(MyAPI)
```

## Configuration

Configuration can be set via **static properties** on the class or **constructor params**. Static properties take precedence.

```ts
import { Server } from "linebridge"

export default class MyAPI extends Server {
  // --- Static configuration (takes precedence) ---
  static refName = "my-service"
  static useEngine = "neo"
  static listenIp = "0.0.0.0"
  static listenPort = 8080
  static websockets = { enabled: true, path: "/ws" }
  static nats = { address: "127.0.0.1", port: 4222 }
  static baseRoutes = true
  static routesPath = "./custom-routes"
  static wsRoutesPath = "./custom-ws-routes"
  static useMiddlewares = ["logs"]
}
```

### All Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `refName` | `string` | `"linebridge"` | Unique name for this service instance |
| `listenIp` | `string` | `"0.0.0.0"` | IP address to bind to |
| `listenPort` | `number` | `3000` | Port to listen on |
| `useEngine` | `string` | `"neo"` | Engine to use for HTTP/WS |
| `websockets` | `boolean \| WebsocketParams` | `false` | Enable WebSocket support |
| `nats` | `NatsParams \| null` | `null` | NATS connection settings |
| `baseRoutes` | `boolean` | `true` | Register `/` and `/_map` endpoints |
| `routesPath` | `string` | `"./routes"` | Directory for file-based HTTP routes |
| `wsRoutesPath` | `string` | `"./ws_routes"` | Directory for file-based WS events |
| `useMiddlewares` | `string[] \| Function[]` | `[]` | Global middlewares to apply |
| `httpMethods` | `string[]` | `["get","post","put","patch","del","delete","trace","head","any","options","ws"]` | Supported HTTP methods |

### WebSocket Params

```ts
interface WebsocketParams {
  enabled: boolean
  path?: string  // default: `/${refName}`
}
```

### NATS Params

```ts
interface NatsParams {
  address?: string  // default: "127.0.0.1"
  port?: number     // default: 4222
}
```

## SSL/TLS

To enable HTTPS, define an `ssl` property on your server:

```ts
export default class SecureAPI extends Server {
  static listenPort = 443

  ssl = {
    key: "/path/to/privkey.pem",
    cert: "/path/to/fullchain.pem",
  }
}
```

The engine automatically detects SSL configuration and creates an `SSLApp` instead of a regular `App`.

## Lifecycle Hooks

Override these methods in your Server subclass to hook into the lifecycle:

```ts
export default class MyAPI extends Server {
  // Runs BEFORE routes are registered and the server listens
  async onInitialize() {
    // Connect to database, load config, etc.
  }

  // Runs AFTER the server is listening
  async afterInitialize() {
    console.log("Server is ready to accept connections")
  }

  // Runs when the server is shutting down
  onClose() {
    // Close database connections, cleanup, etc.
  }
}
```

### Initialization Tasks

For parallel initialization tasks, use the `initialize` array:

```ts
export default class MyAPI extends Server {
  initialize = [
    async () => { /* connect to DB */ },
    async () => { /* warm up cache */ },
  ]
}
```

## WebSocket Hooks

When WebSockets are enabled, you can hook into the connection lifecycle:

```ts
export default class MyAPI extends Server {
  // Called during WebSocket upgrade (before connection is established)
  // Return without calling res.upgrade() to reject
  async handleWsUpgrade(context: any, token: string, res: any) {
    // Validate token, set user context, etc.
    context.user = await validateToken(token)
    res.upgrade(context)
  }

  // Called when a WebSocket connection is opened
  async handleWsConnection(socket: any) {
    console.log("Client connected")
  }

  // Called when a WebSocket connection is closed
  async handleWsDisconnect(socket: any, client?: any) {
    console.log("Client disconnected")
  }
}
```

## Middlewares

Define named middlewares on your server. They can be referenced by name in route definitions.

```ts
export default class MyAPI extends Server {
  middlewares = {
    auth: async (req, res, next) => {
      const token = req.headers["authorization"]
      if (!token) return res.status(401).json({ error: "Unauthorized" })
      req.ctx.user = await validateToken(token)
      next()
    },
  }
}
```

## Contexts

Contexts are injectable values or functions available to route handlers. They are resolved at route initialization time.

```ts
export default class MyAPI extends Server {
  contexts = {
    db: databaseConnection,
    sum: (a: number, b: number) => a + b,
    config: { maxUploadSize: 10 * 1024 * 1024 },
  }
}
```

## Events

The `eventBus` is an internal EventEmitter. You can declare event handlers:

```ts
export default class MyAPI extends Server {
  events = {
    "user:created": (user: any) => {
      console.log("New user:", user)
    },
  }
}
```

## Route Declarations

HTTP routes and WebSocket events can be declared directly on the server. When using `defineRoute<MyAPI>()`, `req` and `res` are fully typed with engine-specific methods:

```ts
export default class MyAPI extends Server {
  routes = {
    "/health": defineRoute<MyAPI>()({
      method: "get",
      fn: async (req, res) => ({ status: "ok" }),
    }),
    "/events": defineRoute<MyAPI>()({
      method: "get",
      fn: (req, res) => {
        const stream = res.sse  // ✅ Neo engine SSE
        if (!stream) return
        stream.open()
        // keep-alive with stream.send(...)
      },
    }),
  }

  wsEvents = {
    "chat:message": async (client, data) => {
      await client.toTopic("chat", "chat:message", data)
    },
  }
}
```

## IPC Events

For inter-process communication via NATS:

```ts
export default class MyAPI extends Server {
  ipcEvents = {
    "getUserCount": async (contexts, data) => {
      return await contexts.db.users.count()
    },
  }
}
```

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `params` | `ServerParams` | Resolved configuration parameters |
| `eventBus` | `EventEmitter` | Internal event bus |
| `engine` | `EngineAdaptor` | The active engine instance |
| `nats` | `NatsAdapter \| null` | NATS adapter (gateway mode) |
| `ipc` | `IPC \| null` | IPC client (gateway mode) |
| `plugins` | `Map<string, ServerPlugin>` | Registered plugins |
| `localAddress` | `string` | Resolved local private IP |
| `experimental` | `boolean` | Whether running an experimental build |
| `hasSSL` | `boolean` | Whether SSL is configured |

## `Boot()` Function

The global `Boot()` function instantiates your server class and calls `run()`:

```ts
Boot(MyAPI)
// Equivalent to:
// const instance = new MyAPI()
// instance.run()
```
