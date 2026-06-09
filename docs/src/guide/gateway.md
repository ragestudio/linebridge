# Gateway Mode

Gateway mode enables Linebridge to run as part of a distributed service mesh. A central gateway routes incoming HTTP and WebSocket traffic to the appropriate backend service.

## How It Works

```
                   ┌──────────────┐
    Client ───────►│   Gateway    │
                   │  (Router)    │
                   └───┬────┬─────┘
                       │    │
              ┌────────┘    └────────┐
              ▼                      ▼
       ┌────────────┐        ┌────────────┐
       │ Service A  │        │ Service B  │
       │ (port 3001)│        │ (port 3002)│
       └─────┬──────┘        └─────┬──────┘
             │                     │
             └─────── NATS ────────┘
                  (Message Bus)
```

## Enabling Gateway Mode

Set the `LB_GATEWAY_SOCKET` environment variable to the path of the gateway's Unix socket:

```bash
LB_GATEWAY_SOCKET=/tmp/lb-gateway.sock npx linebridge-boot index.ts
```

## Service Registration

When a service starts in gateway mode, it:

1. Connects to NATS
2. Creates an IPC client
3. Collects all registered HTTP routes and WebSocket events
4. Sends a registration message to the gateway via Unix socket

The registration payload:

```json
{
  "event": "service:register",
  "data": {
    "namespace": "user-service",
    "secure": false,
    "http": {
      "enabled": true,
      "proto": "http",
      "paths": [
        "/users",
        "/users/:id"
      ]
    },
    "websocket": {
      "enabled": true,
      "proto": "ws",
      "path": "/user-service",
      "events": [
        "chat:message",
        "user:typing"
      ]
    },
    "listen": {
      "ip": "127.0.0.1",
      "port": 3001
    }
  }
}
```

The gateway uses this information to build its routing table.

## Route Discovery

The `getRoutes()` utility extracts all registered routes from the engine:

```ts
import getRoutes from "linebridge/utils/getRoutes"

const { http, websocket } = getRoutes(server.engine)
// http: { get: [{ path: "/users" }, { path: "/users/:id" }], post: [...], ... }
// websocket: ["chat:message", "user:typing", "ping"]
```

Internal routes (`/`, `/_map`) and internal WebSocket events (`ping`, `topic:subscribe`, `topic:unsubscribe`) are filtered out before sending to the gateway.

## Cross-Service Communication

With gateway mode, WebSocket operations automatically route through NATS:

- `client.toTopic()` → dispatches via NATS to reach subscribers on any instance
- `client.emit()` to a remote client → sends through NATS
- `findClientsByUserId()` → queries all instances via NATS

This makes the distributed nature transparent to your application code.

## Unix Socket Mode

Services can also listen on Unix sockets instead of TCP ports:

```bash
LB_SOCKET_MODE=true npx linebridge-boot index.ts
```

When enabled, the engine listens on `/tmp/lb_node_${refName}.sock` instead of `host:port`.
