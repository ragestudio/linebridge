# NATS Adapter API

The `NatsAdapter` class manages the NATS connection and provides cross-instance WebSocket operations and global pub/sub.

## Import

```ts
// NatsAdapter is created internally by the Server when gateway mode is active.
// Access it via: server.nats
```

## Constructor

```ts
new NatsAdapter(server: Server, params?: { address?: string; port?: number })
```

**Parameters:**
- `server` - the Server instance
- `params` - connection config (default: `{ address: "127.0.0.1", port: 4222 }`)

## Properties

### `server: Server`
Reference to the Server instance.

### `params: { address?: string; port?: number }`
NATS connection parameters.

### `refName: string`
Service reference name from `server.constructor.refName`.

### `nats: NatsConnection | null`
Active NATS connection.

### `jetstream: JetStreamClient | null`
JetStream client for persistent messaging.

### `codec: JSONCodec`
JSON codec for message encoding/decoding.

### `serializers`
Efficient serializers using `fast-json-stringify`:

```ts
serializers = {
  EventData,   // { event, data?, error?, ack? }
  Operation,   // { type, data? }
  OpResult,    // { ok, data?, error? }
}
```

### `subscriptions: Map<string, any>`
Active global channel subscriptions.

### `operations`
Cross-instance WebSocket operations:

```ts
operations = {
  findClientsByUserId(user_id: string): Promise<NatsClient[]>
  sendToTopic(topic: string, event: string, data?: any): Promise<any>
  sendToClientID(client_id: string, event: string, data?: any): Promise<void>
  sendToUserId(user_id: string, event: string, data?: any): Promise<any>
}
```

## Methods

### `initialize(): Promise<void>`
Connects to NATS and sets up JetStream consumer:

1. Connects to `nats://${address}:${port}`
2. Creates a JetStream consumer with:
   - Durable name: `${refName}-processor`
   - Queue group: `${refName}-worker`
   - Explicit ack mode
3. Subscribes to `ipc.${refName}`
4. Starts the upstream event loop

### `subscribeToGlobalChannel(channel, handler): Promise<void>`
Subscribes to a global NATS channel:

```ts
await server.nats.subscribeToGlobalChannel("announcements", (data, message) => {
  console.log("Received announcement:", data)
})
```

### `unsubscribeFromGlobalChannel(channel): Promise<void>`
Unsubscribes from a global channel.

### `handleUpstream(message: any): Promise<void>`
Processes incoming NATS messages from the gateway. Handles `socket:connected`, `socket:disconnected`, and general WebSocket events.

### `dispatchOperation(operation: string, data?: any): Promise<any>`
Dispatches an operation request via NATS. Used internally by the operations methods.

## Upstream Event Flow

```
Gateway sends message via NATS
  │
  ▼
NatsAdapter.handleUpstream()
  │
  ├── event: "socket:connected"
  │   └── Creates NatsClient → engine.ws.onConnection()
  │
  ├── event: "socket:disconnected"
  │   └── Creates NatsClient → engine.ws.onDisconnect()
  │
  └── other events
      └── Creates NatsClient → engine.ws.events.get(event)
          └── handler.execute(client, decodedData)
          └── client.ack(event, result, error)
```

## Synthesizing Clients

The `synthesizeClient()` function creates a `NatsClient` from raw client data:

```ts
synthesizeClient(client: ClientInput, adapter: NatsAdapter): NatsClient

interface ClientInput {
  socket_id: string
  token?: string
  session?: { user_id: string; username: string }
  user?: Record<string, any>
}
```

This is used by `findClientsByUserId()` to create client proxies for remote clients.
