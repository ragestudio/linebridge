# Architecture

## Startup Sequence

When `ultragateway` starts, it executes the following in order:

1. **Config load** — reads `.env`, `gateway.config.json`, and `package.json`
2. **Embedded NATS** — starts an in-process NATS server with JetStream
3. **Service scan** — discovers service directories by walking the working directory
4. **Infisical** *(optional)* — loads secrets from Infisical, overrides JWT config
5. **Control API** *(optional)* — starts management HTTP server
6. **OpenTelemetry** *(optional)* — initializes OTLP providers
7. **NATS client** — connects to the embedded NATS, creates JetStream contexts
8. **WebSocket manager** — initializes gws upgrader, NATS operation handlers
9. **IPC listener** — opens the Unix socket for service communication
10. **JSVM plugins** — loads and executes JavaScript scripts
11. **Service start** — spawns each service via the bootloader
12. **HTTP server** — starts the Hertz server with routes and middleware
13. **Cleanup** — defers shutdown handlers (NATS, IPC socket, services, OTEL)

## Component Diagram

```
                          ┌──────────────────────────────────────┐
                          │            ultragateway              │
                          │                                      │
   Client ───────────────►│  ┌────────────────────────────────┐  │
                          │  │         Hertz HTTP Server       │  │
                          │  │  ┌──────────┐  ┌─────────────┐ │  │
                          │  │  │ Middleware│  │   Routes    │ │  │
                          │  │  │ (CORS,   │  │ GET /       │ │  │
                          │  │  │  timing) │  │ GET /ping   │ │  │
                          │  │  └──────────┘  │ ANY /*path  │ │  │
                          │  │                │ GET /ws     │ │  │
                          │  │                └─────────────┘ │  │
                          │  └────────────────────────────────┘  │
                          │                                      │
                          │  ┌────────────────────────────────┐  │
                          │  │       Requests Handler          │  │
                          │  │  ┌──────────┐  ┌─────────────┐ │  │
                          │  │  │  Proxy   │  │  WebSocket  │ │  │
                          │  │  │ Handler  │  │   Upgrade   │ │  │
                          │  │  └────┬─────┘  └──────┬──────┘ │  │
                          │  └───────┼────────────────┼────────┘  │
                          │          │                │           │
                          │  ┌───────▼────────────────▼────────┐  │
                          │  │         Unix Socket IPC          │  │
                          │  │    (service registration +       │  │
                          │  │     HTTP proxy transport)        │  │
                          │  └─────────────────────────────────┘  │
                          │                                      │
                          │  ┌────────────────────────────────┐  │
                          │  │       Embedded NATS Server      │  │
                          │  │  ┌──────────┐  ┌─────────────┐ │  │
                          │  │  │ IPC      │  │   GLOBAL    │ │  │
                          │  │  │ Stream   │  │   Stream    │ │  │
                          │  │  │ (ipc.>)  │  │ (global.>)  │ │  │
                          │  │  └──────────┘  └─────────────┘ │  │
                          │  └────────────────────────────────┘  │
                          │                                      │
                          │  ┌────────────────────────────────┐  │
                          │  │       WebSocket Manager         │  │
                          │  │  ┌──────────┐  ┌─────────────┐ │  │
                          │  │  │Connections│  │ NATS Ops    │ │  │
                          │  │  │ Manager  │  │ (pub/sub,   │ │  │
                          │  │  │          │  │  find, send) │ │  │
                          │  │  └──────────┘  └─────────────┘ │  │
                          │  └────────────────────────────────┘  │
                          │                                      │
                          │  ┌────────────────────────────────┐  │
                          │  │       Service Manager           │  │
                          │  │  ┌──────────┐  ┌─────────────┐ │  │
                          │  │  │ Process  │  │   Watcher   │ │  │
                          │  │  │ Manager  │  │  (fsnotify) │ │  │
                          │  │  └──────────┘  └─────────────┘ │  │
                          │  └────────────────────────────────┘  │
                          └──────────────────────────────────────┘
```

## NATS Subject Topology

```
ipc.>          — JetStream work queue: service → gateway messages
  ipc.<refName>   e.g. ipc.api, ipc.chat

global.>       — JetStream work queue: gateway global broadcasts
  global.connection
  global.disconnection

ipc            — Core NATS subject: downstream messages
                  gateway → service (WebSocket events)

operations     — Core NATS subject: operation request/reply
                  findClientsByUserId, sendToUserId, etc.
```

## Connection Flow

```
1. Client connects to ws://host/ws
2. Gateway extracts JWT token from ?token= query param
3. Validates JWT (ECDSA) if public_key is configured
4. Upgrades to WebSocket via gws
5. Creates WSConnectionCtx with nanoid, token, and JWT meta claims
6. Stores connection in ConnectionManager (by ID + by user_id)
7. Calls ReadLoop() — blocks goroutine for this connection
8. Sends "connected" event to client with socket_id
9. Publishes "connection" event to NATS global stream
```

## Message Flow (Client → Service)

```
1. Client sends { "event": "chat:message", "data": {...} }
2. Gateway OnMessage handler:
   a. Loads connection context from gws session
   b. Parses "event" field from JSON
   c. Handles built-in events: "ping" → "pong", "authenticate" → JWT re-validate
   d. For custom events: builds NATS headers (event, token, socket_id, meta keys)
   e. Calls Nats.PublishToIPC() → looks up service by event → publishes to ipc.<serviceID>
3. Service NatsAdapter receives the message
4. Service dispatches to registered WebSocket event handler
5. Handler processes and may call client.emit(), client.toTopic(), etc.
```

## Downstream Flow (Service → Client)

```
1. Service calls client.emit("response", data)
2. NatsAdapter publishes downstream message with socket_id header
3. Gateway HandleDownstream receives message on "ipc" subject
4. Looks up connection by socket_id in ConnectionManager
5. Writes message bytes directly to the gws connection
```

## Operation Flow (Service → Gateway → Service)

```
1. Service A calls client.toTopic("chat", "message", data)
2. NatsAdapter publishes operation to "operations" subject
3. Gateway HandleOperation receives it:
   a. Parses operation "type" field
   b. Looks up handler in NatsOperations map
   c. Handler executes (e.g. SendToTopic iterates connections)
   d. Responds with OperationResult { ok, data, error }
4. Service A receives the response via NATS reply
```

## Connection Manager

Tracks all WebSocket connections with three data structures:

- **`Clients`** (`sync.Map`): `socket_id → *gws.Conn`
- **`UsersRef`** (`sync.Map`): `user_id → *WSUserConnections{Conns map[string]struct{}}`
- **Session store** (`gws.Session`): per-connection `*WSConnectionCtx`

Authentication flow:
1. Client sends `{ "event": "authenticate", "data": "<jwt>" }`
2. Gateway validates JWT with ECDSA public key
3. Updates `connCtx.Token` and `connCtx.Authorized`
4. Sends `{ "event": "authenticate", "data": { "ok": true }, "ack": true }`

## JSVM Plugins

Gateway plugins are JavaScript files executed in a Goja VM. The VM exposes:

```js
// Global context available to plugins
var ctx = {
  websocketManager: {
    // Access to the gws-based WebSocket manager
  }
}

// Plugin entry point
module.exports = function(ctx) {
  // ctx.websocketManager available for event handling
}
```

Plugins run before services start. If `crash_if_failed` is `true`, a failing plugin terminates the gateway.
