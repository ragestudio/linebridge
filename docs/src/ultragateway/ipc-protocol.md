# IPC Protocol

The gateway communicates with Linebridge services through a Unix domain socket. This is the primary channel for service registration and HTTP request proxying.

## Socket Setup

1. Gateway opens a Unix socket at the path specified in `ipc.path`
2. Socket directory is created with `0755` permissions
3. Socket file is created with `0666` permissions
4. Existing socket file is removed before binding
5. All Linebridge services receive `LB_GATEWAY_SOCKET=<path>` in their environment

## Message Format

All messages are JSON-encoded, newline-delimited:

```json
{
  "event": "service:register",
  "data": { ... }
}
```

The gateway uses a streaming JSON decoder — each message is read until a complete JSON object is decoded. The connection has a 30-second read deadline that resets after each message.

## Service Registration

When a Linebridge service starts in gateway mode (`LB_GATEWAY_SOCKET` is set), it connects to the gateway's Unix socket and sends a registration event:

### Request

```json
{
  "event": "service:register",
  "data": {
    "namespace": "api",
    "secure": false,
    "http": {
      "enabled": true,
      "proto": "http",
      "paths": [
        "/users",
        "/users/:id",
        "/health"
      ]
    },
    "websocket": {
      "enabled": true,
      "proto": "ws",
      "events": [
        "chat:message",
        "chat:join",
        "user:typing"
      ]
    },
    "listen": {
      "ip": "127.0.0.1",
      "port": 3001,
      "socket": "/tmp/lb_node_api.sock"
    }
  }
}
```

### Gateway Processing

On receiving a `service:register` event, the gateway:

1. Looks up the service by `namespace` in its service pool
2. **HTTP routing**: iterates each HTTP path, extracts the first segment as namespace, stores it in `HttpPathsRefs`:
   ```
   /users      → namespace "users" → service "api"
   /health     → namespace "health" → service "api"
   ```
3. **Socket setup**: calls `service.SetListenSocket(socket)` which:
   - Stores the socket path
   - Creates a Hertz HTTP client configured for Unix socket transport
   - This client is used for all HTTP proxying to this service
4. **WebSocket events**: registers each event in NATS's `ServicesEventsMap`:
   ```
   "chat:message" → "api"
   "chat:join"    → "api"
   ```

After registration, the service is fully integrated into the mesh.

## HTTP Proxying

When a client request arrives at the gateway:

1. Namespace is extracted from the URL path
2. Namespace is resolved to service ID via `HttpPathsRefs`
3. Service's Unix socket client is retrieved
4. The request is forwarded over the socket with:
   - Copy of all original headers (minus hop-by-hop)
   - Original method, path, query string, and body
   - 30-second timeout context
5. Response is streamed back to the client

## Connection Lifecycle

### Service connects
- IPC connection is established
- Service sends `service:register` event
- Gateway configures routing

### Service disconnects
- Connection drops (process exit, crash, network)
- Gateway detects EOF on the JSON decoder
- Connection is cleaned up
- If the service restarts, it reconnects and re-registers

### Event Handler Model

The gateway registers handlers by event type string. Currently only `service:register` is implemented. Additional event types can be registered via `RegisterHandler()`:

```go
listener.RegisterHandler("custom:event", handler)
```

Each handler receives the parsed `EventData` and the raw JSON message for custom unmarshaling:

```go
type EventData struct {
    Event string          `json:"event"`
    Data  json.RawMessage `json:"data,omitempty"`
}
```

## Transport Details

- **Protocol**: Unix domain socket (`SOCK_STREAM`)
- **Encoding**: JSON with `\n` delimiter (streaming decoder)
- **Direction**: Bidirectional (currently service → gateway only for registration; HTTP proxy goes gateway → service via Hertz client)
- **Concurrency**: Each connection is handled in its own goroutine
- **Error handling**: Panic recovery in event handlers, decode errors terminate the connection
