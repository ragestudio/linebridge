# IPC & NATS

Linebridge supports distributed architectures through NATS-based inter-process communication (IPC). This enables running multiple service instances that communicate via a NATS message broker.

## Architecture

```
┌──────────────┐         ┌──────────────┐
│   Gateway    │         │   NATS       │
│  (Router)    │◄───────►│  (Message    │
│              │         │   Broker)    │
└──────┬───────┘         └──────┬───────┘
       │                        │
       │    IPC Messages        │
       │                        │
┌──────▼───────────────────────▼──────┐
│         Service Instances           │
│  ┌────────┐ ┌────────┐ ┌────────┐  │
│  │Service │ │Service │ │Service │  │
│  │   A    │ │   B    │ │   C    │  │
│  └────────┘ └────────┘ └────────┘  │
└─────────────────────────────────────┘
```

## Enabling Gateway Mode

When running behind the [Linebridge Gateway](./gateway), set the `LB_GATEWAY_SOCKET` environment variable:

```bash
LB_GATEWAY_SOCKET=/tmp/lb-gateway.sock npx linebridge-boot index.ts
```

The gateway injects this automatically when it starts your service. See the [Linebridge Gateway guide](./gateway) for the full gateway setup.

When this variable is set:

1. The service connects to NATS using the configured `nats` params
2. A `NatsAdapter` instance is created and exposed as `server.nats`
3. An `IPC` client is created and exposed as `server.ipc`
4. The service registers itself with the gateway via Unix socket IPC

## Configuration

```ts
export default class MyAPI extends Server {
  static refName = "user-service"
  static nats = {
    address: "127.0.0.1",
    port: 4222,
  }
}
```

## NATS Adapter

The `NatsAdapter` class manages the NATS connection and provides operations:

### Connection

Connects to NATS on initialization:

```ts
// Internal flow:
const nats = await connect({
  servers: `nats://${params.address}:${params.port}`
})

// Creates a JetStream consumer for IPC
const opts = consumerOpts()
opts.durable(`${refName}-processor`)
opts.queue(`${refName}-worker`)
opts.ackExplicit()
opts.deliverTo(createInbox())

const ipcSub = await jetstream.subscribe(`ipc.${refName}`, opts)
```

### Available Operations

```ts
// Find clients by user ID (across all instances)
const clients = await server.nats.operations.findClientsByUserId("user123")

// Send event to a specific client
await server.nats.operations.sendToClientID("socket-abc", "event", data)

// Send event to all subscribers of a topic
await server.nats.operations.sendToTopic("chat", "message", data)

// Send event to all clients of a user (across all instances)
await server.nats.operations.sendToUserId("user123", "notification", data)
```

### Global Channel Pub/Sub

```ts
// Subscribe to a global channel
await server.nats.subscribeToGlobalChannel("broadcast", (data, message) => {
  console.log("Received:", data)
})

// Unsubscribe
await server.nats.unsubscribeFromGlobalChannel("broadcast")
```

## IPC (Inter-Process Communication)

The `IPC` class enables services to call methods on each other:

### Defining IPC Events

```ts
export default class UserService extends Server {
  ipcEvents = {
    "getUser": async (contexts, data) => {
      const user = await contexts.db.users.findById(data.userId)
      return user
    },

    "createUser": async (contexts, data) => {
      const user = await contexts.db.users.create(data)
      return user
    },
  }
}
```

### Invoking IPC Events

From another service:

```ts
// Internally, services call each other via NATS
const user = await server.ipc.invoke("user-service", "getUser", {
  userId: "123",
})
```

The IPC message flow:

1. Caller encodes the payload with a custom JSON codec
2. NATS delivers the message to a queue group worker
3. Receiver decodes the payload
4. Receiver looks up the event handler in `ipcEvents`
5. Handler executes and returns a result
6. Result is encoded and sent back via NATS

Headers include:
- `event` - the IPC event name

## NATS Client (Synthesized)

When a WebSocket event comes through NATS (from another instance), a `NatsClient` is synthesized to represent the remote client:

```ts
interface ClientInput {
  socket_id: string
  token?: string
  session?: { user_id: string; username: string }
  user?: Record<string, any>
}

const client = synthesizeClient(input, adapter)
```

The synthesized client has the same API as a local WebSocket client (`emit`, `subscribe`, `toTopic`, etc.) but all operations go through NATS.

## Upstream Handling

When a message arrives from NATS (via another gateway), the `handleUpstream` function processes it:

1. Decodes and parses the message headers
2. Creates a `NatsClient` from the headers
3. Routes to the appropriate handler:
   - `socket:connected` → calls `engine.ws.onConnection()`
   - `socket:disconnected` → calls `engine.ws.onDisconnect()`
   - Other events → looks up in `engine.ws.events`

## Serializers

NATS messages use `fast-json-stringify` for efficient serialization:

```ts
// EventData schema
{ event: string, data?: any, error?: any, ack?: boolean }

// Operation schema
{ type: string, data?: any }

// OpResult schema
{ ok: boolean, data?: any, error?: any }
```

## Gateway Registration

When gateway mode is active, the service announces itself to the gateway via a Unix socket. See the [Linebridge Gateway guide](./gateway) for the registration payload format and how the gateway builds its routing table from it.
