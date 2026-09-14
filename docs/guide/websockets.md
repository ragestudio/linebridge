# WebSockets

Linebridge provides first-class WebSocket support through the **RTEngine** (Real-Time Engine), built on top of uWebSockets.js pub/sub capabilities.

## Enabling WebSockets

```ts
export default class MyAPI extends Server {
  // Simple enable (path defaults to /${refName})
  static websockets = true

  // With custom path
  static websockets = { enabled: true, path: "/ws" }
}
```

## WebSocket Lifecycle

```
Client connects
  │
  ▼
upgrade handler ──► handleWsUpgrade(context, token, res)
  │                      │
  │                   res.upgrade(context)  // accept
  │                   res.status(401).end() // reject
  ▼
open handler ──► handleWsConnection(socket)
  │
  ▼
message handler ──► RTEngine.handlers.message(socket, payload)
  │                      │
  │                   event lookup ──► handler.execute(client, data)
  ▼
close handler ──► handleWsDisconnect(socket, client)
```

## WebSocket Hooks

### Upgrade Hook

Called before the WebSocket connection is established. Use it to authenticate and attach user data:

```ts
export default class MyAPI extends Server {
  async handleWsUpgrade(context: any, token: string, res: any) {
    if (!token) {
      return res.status(401).end()
    }

    const user = await validateToken(token)
    if (!user) {
      return res.status(401).end()
    }

    context.user = user
    res.upgrade(context)
  }
}
```

### Connection Hook

Called when a WebSocket connection is opened:

```ts
async handleWsConnection(socket: any) {
  console.log(`Client connected: ${socket.context.id}`)
}
```

### Disconnect Hook

Called when a WebSocket connection closes:

```ts
async handleWsDisconnect(socket: any, client?: any) {
  console.log(`Client disconnected: ${socket.context.id}`)
  // client.unsubscribeAll() is called automatically
}
```

## WebSocket Events

Events are handled by the RTEngine's event system. Define events directly on the server:

```ts
export default class MyAPI extends Server {
  wsEvents = {
    "chat:message": async (client, data) => {
      await client.toTopic("chat", "chat:message", {
        user: client.userId,
        text: data.text,
      })
    },

    "chat:join": async (client, data) => {
      await client.subscribe("chat")
      await client.emit("chat:joined", { topic: "chat" })
    },

    "chat:leave": async (client, data) => {
      await client.unsubscribe("chat")
    },
  }
}
```

## The Client Object

The `Client` object is passed to every WebSocket event handler. It provides methods for communication:

### Client API

| Method | Description |
|--------|-------------|
| `client.emit(event, data?, error?, ack?)` | Send an event to this client |
| `client.error(error)` | Send an error event to this client |
| `client.ack(eventKey, data?, error?)` | Send an acknowledgment for an event |
| `client.subscribe(topic)` | Subscribe this client to a topic |
| `client.unsubscribe(topic)` | Unsubscribe this client from a topic |
| `client.unsubscribeAll()` | Unsubscribe from all topics |
| `client.toTopic(topic, event, data?, self?)` | Send event to all subscribers of a topic |
| `client.operation(type, data?)` | Send an operation request |

### Client Properties

| Property | Description |
|----------|-------------|
| `client.id` | Unique socket identifier |
| `client.userId` | User ID (set during upgrade) |
| `client.authenticated` | Whether the client has a session |
| `client.context` | Full context object from upgrade |

## Topic-Based Pub/Sub

Topics use MQTT-style syntax with wildcard support:

| Pattern | Matches |
|---------|---------|
| `chat` | Exact topic "chat" |
| `chat/room1` | Nested topic |
| `chat/+` | Single-level wildcard |
| `chat/#` | Multi-level wildcard (terminating) |

```ts
// Subscribe to a topic
await client.subscribe("chat/room1")

// Send to all subscribers of a topic
await client.toTopic("chat/room1", "new-message", { text: "Hello" })

// Publish directly via engine (server-side)
server.engine.publish("chat/room1", JSON.stringify({ text: "Broadcast" }))
```

## Finding Clients

Locate connected clients by user ID:

```ts
const clients = server.engine.ws.find.clientsByUserId("user123")
for (const client of clients) {
  await client.emit("notification", { message: "You have mail" })
}
```

## Sending to Specific Clients

```ts
// Send to a specific client by socket ID
await server.engine.ws.senders.toClientId("socket-abc", "private-message", data)

// Send to all clients of a specific user
await server.engine.ws.senders.toUserId("user123", "notification", data)
```

## Built-in Events

The RTEngine includes a built-in `ping` event:

```ts
// Client sends: { event: "ping" }
// Server responds with: { event: "pong" }
```

## Client Message Protocol

Client messages follow this JSON structure:

```json
{
  "event": "chat:message",
  "data": { "text": "Hello" },
  "ack": true
}
```

- `event` - the event name to dispatch
- `data` - arbitrary payload
- `ack` - if `true`, the server sends an acknowledgment response

## File-Based WebSocket Events

WebSocket events can also be defined as files in the `ws_routes/` directory. The file path becomes the event name with `/` replaced by `:`:

```
ws_routes/
  chat/
    message.ts    → event: "chat:message"
    join.ts       → event: "chat:join"
```

Each file exports a handler function or an object with a `fn` property:

```ts
// ws_routes/chat/message.ts
export default async (client, data) => {
  await client.toTopic("chat", "chat:message", data)
}
```
