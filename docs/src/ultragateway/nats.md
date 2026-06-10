# NATS Internals

The gateway runs an **embedded NATS server** in-process. All services connect to this NATS instance for messaging. No external NATS deployment is needed.

## Embedded Server

```go
func StartEmbeddedNats() *natsServer.Server {
    opts := &natsServer.Options{
        Host:       "0.0.0.0",
        Port:       4222,
        Debug:      IsDebug,
        NoSigs:     true,
        MaxPayload: 1024 * 1024,   // 1 MB
        JetStream:  true,
        StoreDir:   "./nats-data",
    }
    ns, _ := server.NewServer(opts)
    go ns.Start()
    ns.ReadyForConnections(5 * time.Second)
    return ns
}
```

Key characteristics:
- Listens on `0.0.0.0:4222`
- JetStream enabled for persistent work queues
- 1 MB max payload
- Signal handling disabled (gateway manages shutdown)
- Data stored in `./nats-data/`
- 5-second startup timeout

## JetStream Streams

### IPC Stream
```
Name:      IPC
Subjects:  ipc.>
Storage:   Memory
Retention: Work Queue
Discard:   Old
MaxAge:    24 hours
```

Handles service-to-gateway messages. Each service publishes to its dedicated subject (`ipc.<refName>`).

### GLOBAL Stream
```
Name:      GLOBAL
Subjects:  global.>
Storage:   Memory
Retention: Work Queue
Discard:   Old
MaxAge:    24 hours
```

Handles gateway-wide broadcasts (connection/disconnection events).

## Core NATS Subjects

### `ipc` (subscription)
The gateway subscribes to the `ipc` subject for downstream messages:

```
Service emits to client
  → NatsAdapter publishes to "ipc" subject
  → Headers include: socket_id, event, token
  → Gateway HandleIPC receives
  → Looks up connection by socket_id
  → Writes message to gws connection
```

### `operations` (subscription)
The gateway subscribes to `operations` for service-requested actions:

```
Service calls client.toTopic() / findClientsByUserId() / etc.
  → NatsAdapter publishes to "operations" subject
  → Gateway HandleOperations receives
  → Parses operation type, dispatches to handler
  → Responds via NATS reply with OperationResult
```

## Event Registration

When a service registers via IPC, its WebSocket events are stored in `ServicesEventsMap`:

```go
type Instance struct {
    ServicesEventsMap map[string]string  // eventID → serviceID
}
```

Example:
```
"chat:message" → "chat"
"chat:join"    → "chat"
"user:typing"  → "chat"
```

When a WebSocket event arrives at the gateway, `PublishToIPC()`:
1. Looks up `eventID` in `ServicesEventsMap`
2. Gets the `serviceID`
3. Publishes to `ipc.<serviceID>` via JetStream
4. The service's NatsAdapter receives it

## Message Headers

NATS messages include these headers for routing and context:

| Header | Source | Description |
|--------|--------|-------------|
| `event` | Gateway | WebSocket event name |
| `token` | Gateway | Client JWT token |
| `socket_id` | Gateway | Client connection ID |
| `user_id` | Gateway (from JWT meta) | Authenticated user ID |
| `<meta_key>` | Gateway (from JWT meta) | Any extracted JWT claim |

## Publish Methods

### `PublishToIPC(payload)`
Sends a message upstream to a specific service. Used for WebSocket event routing.

```go
func (instance *Instance) PublishToIPC(payload *UpstreamPayload) {
    serviceID, _ := instance.LookupServiceByEventID(payload.Event)
    instance.Jetstream.PublishMsgAsync(&nats.Msg{
        Subject: "ipc." + serviceID,
        Data:    payload.Data,
        Header:  payload.Header,
    })
}
```

### `PublishToGlobal(payload)`
Broadcasts a message to all services. Used for connection/disconnection events.

```go
func (instance *Instance) PublishToGlobal(payload *UpstreamPayload) {
    instance.Jetstream.PublishMsgAsync(&nats.Msg{
        Subject: "global." + payload.Event,
        Data:    payload.Data,
        Header:  payload.Header,
    })
}
```

## NATS Client Connection

The gateway also acts as a NATS client (connecting to its own embedded server):

```go
client, _ := nats.Connect(nats.DefaultURL)  // nats://localhost:4222
jetstream, _ := jetstream.New(client)
```

This client is used for:
- Publishing to JetStream streams
- Subscribing to `ipc` and `operations` subjects
- Sending operation request/reply messages

## Operation Protocol

Services request gateway operations through the `operations` subject with reply:

```
Service A → NATS: operations (request-reply)
  Subject: operations
  Reply:   _INBOX.xxx (auto-generated)
  Data:    { "type": "sendToUserId", ... }

Gateway processes operation
  → Responds via msg.Respond()

Service A receives response
  → { "ok": true, "data": {...} }
```

This is synchronous from the service's perspective (the NatsAdapter awaits the reply), but asynchronous within the gateway (operations are processed in goroutines).

## Shutdown

On gateway shutdown:
1. NATS server `Shutdown()` is called
2. Pending JetStream messages are processed before shutdown
3. NATS client connections are closed
4. `./nats-data/` directory persists for recovery across restarts
