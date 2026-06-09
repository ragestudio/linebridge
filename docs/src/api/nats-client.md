# NATS Client API

The `NatsClient` class represents a WebSocket client that is connected through NATS (from another service instance). It implements the same API as the local RTEngine `Client`.

## Import

```ts
// NatsClient instances are created automatically by the NatsAdapter.
// Not typically instantiated directly by user code.
```

## Constructor

```ts
new NatsClient({
  engine: any,
  nats: any,
  headers: any,
  codec: any,
})
```

## Properties

### `id: string`
The client's socket ID.

### `userId: string | undefined`
The client's user ID (from headers).

### `user: Record<string, any>`
User object (parsed from headers). Falls back to `{ _id, username, avatar }`.

### `authenticated: boolean`
Whether the client has both a token and user ID.

### `context: NatsClientContext`

```ts
interface NatsClientContext {
  id: string
  socket_id: string
  token?: string
  user_id?: string
  userId?: string
  username?: string
  user?: Record<string, any>
}
```

## Methods

### `emit(event: string, data?: any, error?: any, ack?: boolean): Promise<void>`
Sends an event to this client via NATS.

```ts
await client.emit("notification", { message: "Hello" })
```

### `error(error: any): Promise<void>`
Sends an error event to this client.

```ts
await client.error("Something went wrong")
```

### `ack(event: string, data?: any, error?: any): Promise<void>`
Sends an acknowledgment for an event. The `event` parameter must be a string.

```ts
await client.ack("chat:message", { delivered: true })
```

### `subscribe(topic: string): Promise<any>`
Subscribes the client to a topic. Dispatches a `subscribeToTopic` operation.

```ts
const result = await client.subscribe("chat:room1")
// On success, emits "topic:subscribed" event to client
```

### `unsubscribe(topic: string): Promise<any>`
Unsubscribes the client from a topic. Dispatches an `unsubscribeToTopic` operation.

### `toTopic(topic: string, event: string, data?: any, self?: boolean): Promise<any>`
Sends an event to all subscribers of a topic. Dispatches a `sendToTopic` operation.

If `self` is `true`, also emits the event to this client.

```ts
await client.toTopic("chat", "chat:message", { text: "Hello everyone" })
await client.toTopic("chat", "chat:message", { text: "Hi" }, true) // includes self
```

### `operation(type: string, data?: any): Promise<any>`
Sends an operation request via NATS and awaits the response.

```ts
const result = await client.operation("customOp", { key: "value" })
```

## Communication Flow

All methods publish to NATS with appropriate headers:

- Headers include: `socket_id`, `token`, `user_id`, `username`, `user`
- Events are serialized using `fast-json-stringify`
- Operations use NATS request-reply pattern with 50 second timeout

## Comparison: Local vs NATS Client

| Feature | Local Client (RTEngine) | NATS Client |
|---------|------------------------|-------------|
| Transport | Direct WebSocket | NATS messaging |
| `emit()` | Direct WS send | NATS publish to `ipc` subject |
| `subscribe()` | Local WS subscribe | NATS operation dispatch |
| `toTopic()` | Local WS publish | NATS operation dispatch |
| `operation()` | Returns `null` | NATS request-reply |
| `userId` | From upgrade context | From headers |
| Latency | Sub-millisecond | Network-dependent |
