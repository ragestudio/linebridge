# IPC API

The `IPC` class enables inter-process communication between Linebridge services via NATS. Services can invoke methods on each other using a request-reply pattern.

## Import

```ts
// IPC is created internally by the Server when gateway mode is active.
// Access it via: server.ipc
```

## Constructor

```ts
new IPC(server: any, nats: NatsConnection)
```

**Parameters:**
- `server` - the Server instance (must have `params.refName`)
- `nats` - an active NATS connection

## Properties

### `server: any`
Reference to the Server instance.

### `nats: NatsConnection`
The NATS connection.

### `codec: JSONCodec`
Custom JSON codec for encoding/decoding messages.

```ts
class JSONCodec implements Codec<any> {
  encode(data: any): Uint8Array
  decode(data: any): any
}
```

### `isAvailable: boolean`
Whether the NATS connection is available.

## Subscription

On construction, the IPC subscribes to `ipc_internal.${refName}` with a queue group:

```ts
const subscription = this.nats.subscribe(`ipc_internal.${refName}`, {
  queue: `${refName}-internal_ipc-worker`,
})
```

Messages are consumed in a loop via async iteration.

## Methods

### `handleReceivedEvent(message: Msg): Promise<void>`
Internal. Processes incoming IPC messages:

1. Extracts the `event` header from the message
2. Looks up the handler in `server.ipcEvents[event]`
3. Calls the handler with `(server.contexts, decodedData)`
4. Responds with the result (or error if thrown)

### `invoke(targetServiceID: string, command: string, payload?: any): Promise<any>`
Invokes an IPC event on a remote service.

**Parameters:**
- `targetServiceID` - the `refName` of the target service
- `command` - the event name (must exist in the target's `ipcEvents`)
- `payload` - data to send (default: `{}`)

**Returns:** The result from the remote handler.

**Throws:** If no response, no data, or the remote handler returns an error.

```ts
const result = await server.ipc.invoke("user-service", "getUser", {
  userId: "abc123",
})
```

## Defining IPC Events

On the server, define handlers in `ipcEvents`:

```ts
export default class UserService extends Server {
  ipcEvents = {
    "getUser": async (contexts, data) => {
      const user = await contexts.db.users.findById(data.userId)
      if (!user) {
        throw new OperationError(404, "User not found")
      }
      return user
    },

    "searchUsers": async (contexts, data) => {
      return await contexts.db.users.search(data.query)
    },
  }
}
```

The handler signature:

```ts
type IPCEventFn = (contexts: Record<string, any>, data: any) => any
```

## Message Flow

```
┌──────────────┐                          ┌──────────────┐
│  Service A   │                          │  Service B   │
│              │                          │              │
│  ipc.invoke( │  NATS Request            │  ipcEvents   │
│   "svc-b",   │─────────────────────────►│  ["getUser"] │
│   "getUser", │                          │              │
│   { id: 1 }) │  NATS Response           │              │
│              │◄─────────────────────────│              │
└──────────────┘                          └──────────────┘
```

1. Service A sends a request to `ipc_internal.svc-b` with header `event: getUser`
2. Service B's IPC subscription receives the message (via queue group)
3. Handler executes and returns a result
4. Result is encoded and sent back as a response
5. Service A's `invoke()` resolves with the result

## Error Handling

- If the remote handler throws, the error message is sent back
- `invoke()` throws with the remote error message
- Timeout: 50 seconds (configurable in source)
