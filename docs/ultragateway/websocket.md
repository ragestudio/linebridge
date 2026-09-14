# WebSocket

The gateway provides WebSocket connectivity at `GET /ws`. It acts as a WebSocket proxy: clients connect to the gateway, and messages are routed through NATS to the Linebridge services.

## Stack

- **Upgrader**: [gws](https://github.com/lxzan/gws) with per-message deflate disabled, parallel message handling enabled
- **Transport**: NATS JetStream for upstream/downstream messaging
- **Auth**: JWT via ECDSA or HMAC

## Upgrade Flow

1. Client connects to `ws://host/ws?token=<jwt>`
2. Gateway checks `Upgrade: websocket` header
3. If JWT public key is configured:
   - Extracts token from `?token=` query parameter
   - Validates with ECDSA public key
   - Extracts meta claims per `jwt.use_keys` config
   - Creates `WSConnectionCtx` with authorized flag
4. Upgrades connection via gws
5. Generates a nanoid for the socket ID
6. Stores connection + context in ConnectionManager
7. Sends `{ "event": "connected", "data": { "id", "authenticated", "meta" } }` to client
8. Publishes global connection event via NATS

## Connection Context

```go
type WSConnectionCtx struct {
    ID         string            // nanoid
    Token      string            // JWT string
    Authorized bool              // JWT validation result
    Meta       map[string]string // extracted claims
}
```

## Built-in Events

Events handled directly by the gateway (not routed to services):

### `ping`
```json
{ "event": "ping" }
→ { "event": "pong" }
```

### `authenticate`
Re-authenticates an existing connection with a new JWT:

```json
// Request
{ "event": "authenticate", "data": "<new-jwt>" }

// Success
{ "event": "authenticate", "data": { "ok": true }, "ack": true }

// Failure
{ "event": "authenticate", "data": { "error": "..." }, "ack": true }
```

On success, updates `connCtx.Token` and `connCtx.Authorized`.

## Custom Event Routing

All other events are routed to Linebridge services via NATS:

1. Gateway loads connection context and meta claims
2. Builds NATS headers: `event`, `token`, `socket_id`, and all meta keys/values
3. Calls `Nats.PublishToIPC(payload)`
4. NATS looks up which service registered the event name
5. Publishes to `ipc.<serviceID>` JetStream subject
6. Service's NatsAdapter receives and dispatches to the handler

## NATS Operations

The gateway handles these operation types, requested by services:

### `subscribeToTopic`
Subscribes a connection to a pub/sub topic. Subsequent `sendToTopic` calls will deliver to this subscriber.

### `unsubscribeToTopic`
Removes a connection from a topic subscription.

### `sendToTopic`
Sends an event to all connections subscribed to a topic.

### `sendToUserId`
Sends an event to all connections belonging to a user ID. Uses the `UsersRef` index to find all connections.

### `findClientsByUserId`
Returns a list of socket IDs for a given user ID. Used for cross-instance client discovery.

### Operation Protocol

```go
// Request (on "operations" subject)
{
  "type": "sendToUserId",
  "data": { "user_id": "user123", "event": "notification", "data": {...} }
}

// Response (via NATS reply)
{
  "ok": true,
  "data": { "sent": 3 },
  "error": ""
}
```

## Downstream Messages

When a service emits to a specific client (`client.emit()`):

1. Service's NatsAdapter publishes to NATS `ipc` subject
2. Header includes `socket_id`
3. Gateway's `HandleDownstream` receives the message
4. Looks up the connection by `socket_id`
5. Writes raw bytes to the gws connection

## Connection Lifecycle

### OnOpen
- Loads context from gws session
- Sends `connected` event with socket ID and auth status
- Publishes global connection event via NATS

### OnClose
- Removes connection from ConnectionManager
- Cleans up user ID references
- Publishes global disconnection event via NATS

### OnPing/OnPong
- Handled by gws at the protocol level (WebSocket ping/pong frames)

## Global Events

Published to the `global.>` JetStream stream:

| Event | Subject | Description |
|-------|---------|-------------|
| `connection` | `global.connection` | New WebSocket connection opened |
| `disconnection` | `global.disconnection` | WebSocket connection closed |

Services can subscribe to these for presence tracking.
