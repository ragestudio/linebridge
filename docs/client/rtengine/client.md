# RTEngineClient
## Overview
`RTEngineClient` is a WebSocket client for real-time communication with backend services. It provides connection management, automatic reconnection, heartbeat monitoring, event handling, and topic-based subscriptions.

## API Reference
### Constructor
```javascript
const client = new RTEngineClient({
  refName: "main",
  url: "wss://example.com/socket",
  token: "auth-token-here",
  autoReconnect: true
})
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| params.refName | string(optional) | "default" | Reference name for this client instance |
| params.url | string | - | WebSocket server URL to connect to |
| params.token | string(optional) | - | Authentication token to include in the connection |
| params.autoReconnect | boolean | true | Whether to automatically attempt reconnection |
| params.maxConnectRetries | number | Infinity | Maximum number of reconnection attempts |
| params.heartbeat | boolean | true | Whether to use heartbeat to monitor connection health |

### Static Properties
| Property | Type | Description |
|----------|------|-------------|
| version | string | Client library version |
| heartbeatTimeout | number | Timeout for heartbeat checks (10000ms) |
| reconnectTimeout | number | Delay between reconnection attempts (5000ms) |

### State Object
The client state can be accessed via `client.state`:

| Property | Type | Description |
|----------|------|-------------|
| id | string\|null | Client ID assigned by the server |
| connected | boolean | Whether the client is currently connected |
| authenticated | boolean | Whether the client is authenticated |
| lastPing | number\|null | Timestamp of the last ping sent |
| lastPong | number\|null | Timestamp of the last pong received |
| latency | number\|null | Current connection latency in milliseconds |
| reconnecting | boolean | Whether the client is attempting to reconnect |
| connectionRetryCount | number | Number of reconnection attempts made |

### Methods

#### connect()

Establishes a connection to the WebSocket server.

```javascript
await client.connect()
```

| Returns | Description |
|---------|-------------|
| Promise<void> | Resolves when the connection is established |

#### disconnect()

Closes the current WebSocket connection.

```javascript
await client.disconnect()
```

| Returns | Description |
|---------|-------------|
| Promise<boolean> | Resolves to false if no connection exists, true otherwise |

#### on(event, handler)

Registers an event handler.

```javascript
client.on("message", (data) => {
  console.log("Message received:", data)
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| event | string | Event name to listen for |
| handler | Function | Function to call when the event is received |

#### off(event, handler)

Removes an event handler.

```javascript
client.off("message", messageHandler)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| event | string | Event name to stop listening for |
| handler | Function | Handler function to remove |

#### once(event, handler)

Registers a one-time event handler.

```javascript
client.once("connected", () => {
  console.log("Connected!")
})
```

| Parameter | Type | Description |
|-----------|------|-------------|
| event | string | Event name to listen for |
| handler | Function | Function to call once when the event is received |

#### emit(event, data)

Sends an event to the WebSocket server.

```javascript
await client.emit("chat:message", { text: "Hello!" })
```

| Parameter | Type | Description |
|-----------|------|-------------|
| event | string | Event name to emit |
| data | any | Data to send with the event |
| Returns | Promise<null\|void> | Promise that resolves when the event is sent, or null if not connected |

## Topic Management

The client includes a `TopicsController` instance accessible via `client.topics`.

```javascript
// Subscribe to a topic
await client.topics.subscribe("chat/room1")

// Listen for events on a specific topic
client.topics.on("chat/room1", "message", handleMessage)

// Unsubscribe from a topic
await client.topics.unsubscribe("chat/room1")
```

### Basic Usage Example

```javascript
import RTEngineClient from "./RTEngineClient"

// Initialize the client
const client = new RTEngineClient({
  url: "wss://api.example.com/socket",
  token: "user-auth-token" // optional if server not requires authentication
})

// Connect to the server
await client.connect()

// Subscribe to a topic
await client.topics.subscribe("updates")

// Listen for specific events
client.on("notification", (data) => {
  console.log("New notification:", data)
})

// Listen for events on a specific topic
client.topics.on("updates", "new_version", (data) => {
  console.log("New version available:", data.version)
})

// Send an event
await client.emit("user:status", { status: "online" })

// Disconnect when done
await client.disconnect()
```
