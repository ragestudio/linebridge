# RTEngine API

The Real-Time Engine (`RTEngine`) manages WebSocket connections, events, and pub/sub messaging. It is created automatically by the Neo engine when WebSockets are enabled.

## Import

```ts
// RTEngine is created internally by the Neo engine.
// Access it via: server.engine.ws
```

## Constructor

```ts
new RTEngine(server: Server, config?: RtEngineConfig)
```

### `RtEngineConfig`

```ts
interface RtEngineConfig {
  events?: Record<string, WebsocketHandlerFunction>
  onUpgrade?: ((context: any, token: string, res: any) => Promise<void>) | null
  onConnection?: ((socket: any) => Promise<void>) | null
  onDisconnect?: ((socket: any, client?: any) => Promise<void>) | null
  path?: string  // WebSocket endpoint path (default: "/")
}
```

## Properties

### `server: Server`
Reference to the Server instance.

### `config: RtEngineConfig`
Resolved configuration.

### `engine: any`
Reference to the underlying uWS engine (set via `attach()`).

### `events: Map<string, Handler>`
Map of event handlers. Includes built-in events and user-defined events.

### `clients: Clients`
Map of connected clients (`Map<string, Client>`).

### `senders`
Utility object for sending to clients:

```ts
senders: {
  toTopic(topic: string, event: string, data?: any): Promise<any>
  toClientId(client_id: string, event: string, data?: any): Promise<any>
  toUserId(user_id: string, event: string, data?: any): Promise<any>
}
```

### `find`
Utility object for finding clients:

```ts
find: {
  clientsByUserId(user_id: string): Promise<Client[]>
}
```

## Lifecycle Hooks

### `onUpgrade`
Called during WebSocket upgrade. Set from `server.handleWsUpgrade` or config.

### `onConnection`
Called when a connection opens. Set from `server.handleWsConnection` or config.

### `onDisconnect`
Called when a connection closes. Set from `server.handleWsDisconnect` or config.

## Methods

### `handleMessage(socket: RtEngineSocket, rawPayload: any): Promise<void>`
Processes incoming WebSocket messages:

1. Looks up the client in `this.clients`
2. Decodes the JSON payload
3. Looks up the event handler in `this.events`
4. Executes the handler with `handler.execute(client, payload)`
5. If `payload.ack === true`, sends an acknowledgment

### `handleConnection(socket: RtEngineSocket): Promise<void>`
Handles new WebSocket connections:

1. Calls `onConnection` if defined
2. Registers `message` and `close` event listeners on the socket
3. Creates a `Client` instance
4. Sends a `connected` event to the client
5. Adds the client to `this.clients`

### `handleDisconnect(socket: RtEngineSocket): Promise<void>`
Handles WebSocket disconnections:

1. Calls `onDisconnect` if defined
2. Unsubscribes the client from all topics
3. Removes the client from `this.clients`

### `handleUpgrade(req: any, res: any): Promise<void>`
Handles WebSocket upgrade requests:

1. Creates a context object with a unique ID and token
2. Calls `onUpgrade(context, token, res)` if defined
3. Otherwise, automatically upgrades: `res.upgrade(context)`

### `registerEvent(event: string, handler: any): void`
Registers a single WebSocket event handler:

```ts
engine.ws.registerEvent("custom:event", async (client, data) => {
  await client.emit("response", { ok: true })
})
```

### `registerEvents(obj: Record<string, any>): void`
Registers multiple WebSocket event handlers at once.

### `attach(engine: any): void`
Attaches to the uWS engine, registering the WebSocket route and upgrade handler.

### `encode(data: any): string`
Serializes data to JSON string.

### `decode(data: any): any`
Parses JSON string to object.

## Client API

### `Client` Class

```ts
class Client {
  id: string                    // unique socket ID
  userId: string | null         // user ID (from upgrade context)
  authenticated: boolean        // whether the client has a session
  context: object              // full upgrade context

  // Communication
  emit(event, data?, error?, ack?): Promise<any>
  error(error): Promise<void>
  ack(eventKey, data?, error?): Promise<any>

  // Pub/Sub
  subscribe(topic): Promise<any>
  unsubscribe(topic): Promise<any>
  unsubscribeAll(): Promise<void>
  toTopic(topic, event, data?, self?): Promise<any>

  // Operations
  operation(type, data?): Promise<any>
}
```

### `Clients` Class

```ts
class Clients extends Map<string, Client> {
  engine: RTEngine
}
```

A `Map` of client ID → `Client` instance with a reference to the RTEngine.

## Built-in Events

| Event | Handler |
|-------|---------|
| `ping` | Responds with `pong` |

## Distributed Mode

When NATS is active (`server.nats`), operations automatically route through NATS:

- `findClientsByUserId()` → queries all instances via NATS
- `sendToClientId()` → sends via NATS if client is remote
- `sendToTopic()` → publishes via NATS
- `sendToUserId()` → finds clients across all instances

This makes the distributed nature transparent - the same API works for both local and remote clients.
