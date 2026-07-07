# Linebridge Gateway

The **Linebridge Gateway** (`ultragateway`) is a standalone Go binary that orchestrates multiple Linebridge services into a distributed mesh. It provides HTTP routing, WebSocket proxying, embedded NATS for pub/sub messaging, and inter-service communication via Unix sockets.

> **Platform**: The Gateway uses Unix sockets for IPC and is designed for Linux and macOS. Windows users should use [WSL](https://learn.microsoft.com/en-us/windows/wsl/).

## Architecture

```
                          ┌──────────────────────┐
           Client ───────►│   Linebridge Gateway  │
                          │   (HTTP Router + WS)  │
                          └──────┬───────┬───────┘
                                 │       │
                    ┌────────────┘       └────────────┐
                    ▼                                 ▼
             ┌────────────┐                   ┌────────────┐
             │ Service A  │                   │ Service B  │
             │ ("api")    │                   │ ("chat")   │
             └──────┬─────┘                   └──────┬─────┘
                    │                                │
                    └────────── NATS ────────────────┘
                           (Message Bus)
```

The gateway runs an **embedded NATS server** with JetStream for reliable messaging. Each Linebridge service connects to NATS and registers its HTTP routes and WebSocket events with the gateway via a **Unix socket IPC** channel.

## Installation

```bash
curl -fsSL https://git.ragestudio.net/RageStudio/linebridge-gateway/raw/branch/main/install.sh | sudo sh
```

This downloads the binary for your architecture (`x86_64`, `x86_64-v3`, or `aarch64`) and installs it to `/usr/local/bin/ultragateway`.

## Project Structure

```
my-project/
├── gateway.config.json     # Gateway configuration
├── package.json            # Project metadata (name, version)
├── services/               # Linebridge service directories
│   ├── api/
│   │   ├── index.ts
│   │   └── routes/
│   └── chat/
│       ├── index.ts
│       └── routes/
└── node_modules/
    └── linebridge/         # Framework (provides bootloader)
```

## Configuration

Create a `gateway.config.json` in your project root:

```json
{
  "mode": "dev",
  "http": {
    "port": 3000,
    "secure_port": 3443,
    "certificates": {
      "cert": "/path/to/fullchain.pem",
      "key": "/path/to/privkey.pem"
    }
  },
  "ipc": {
    "path": "/tmp/lb-gateway.sock"
  },
  "services": {
    "bootloader": ""
  },
  "jwt": {
    "secret": "your-jwt-secret",
    "private_key": "/path/to/ecdsa-private.pem",
    "public_key": "/path/to/ecdsa-public.pem"
  },
  "scripts": [],
  "routes": [],
  "control_api": {
    "enabled": false,
    "listen": ":9090"
  },
  "otel": {
    "enabled": false,
    "name": "my-gateway",
    "endpoint": "localhost:4317",
    "headers": ""
  }
}
```

### Configuration Reference

| Section | Field | Type | Description |
|---------|-------|------|-------------|
| **Root** | `mode` | `"dev"` \| `"prod"` | Development mode enables file watchers for hot-reload |
| **http** | `port` | `number` | HTTP listen port (default from config) |
| **http** | `secure_port` | `number` | HTTPS listen port |
| **http** | `certificates.cert` | `string` | TLS certificate path |
| **http** | `certificates.key` | `string` | TLS private key path |
| **ipc** | `path` | `string` | Unix socket path for service IPC |
| **services** | `bootloader` | `string` | Custom bootloader path (default: auto-detected from `node_modules/linebridge`) |
| **jwt** | `secret` | `string` | JWT signing secret |
| **jwt** | `private_key` | `string` | ECDSA private key path |
| **jwt** | `public_key` | `string` | ECDSA public key path |
| **jwt** | `use_keys` | `array` | Additional JWT verification keys |
| **scripts** | `[].path` | `string` | JavaScript plugin script path |
| **scripts** | `[].crash_if_failed` | `boolean` | Crash gateway if script fails |
| **routes** | `[].path` | `string` | Custom route pattern (e.g. `/api/*`) |
| **routes** | `[].target` | `string` | Proxy target URL |
| **routes** | `[].path_rewrite` | `object` | Path rewrite rules |
| **routes** | `[].websocket` | `boolean` | Enable WebSocket proxying |
| **control_api** | `enabled` | `boolean` | Enable control API |
| **control_api** | `listen` | `string` | Control API listen address (default `:9090`) |
| **otel** | `enabled` | `boolean` | Enable OpenTelemetry |
| **otel** | `name` | `string` | Service name for traces |
| **otel** | `endpoint` | `string` | OTLP endpoint |
| **otel** | `headers` | `string` | OTLP headers |

## Starting the Gateway

```bash
# From your project root
ultragateway .

# Or specify a path
ultragateway /path/to/project
```

The gateway:
1. Loads `.env` and `gateway.config.json`
2. Scans the project for Linebridge services (directories with `index.ts`)
3. Starts an embedded NATS server (port `4222`) with JetStream
4. Opens a Unix socket listener for service IPC
5. Starts all services with the gateway socket path injected as `LB_GATEWAY_SOCKET`
6. Starts the HTTP server on the configured port
7. Routes incoming requests to the correct service by URL namespace

## How Routing Works

### HTTP Routing

Each service's `refName` becomes its **namespace** (first URL segment). When a service registers, the gateway maps its routes under that namespace:

```
GET /api/users        → Service "api"    → GET /users
GET /chat/messages    → Service "chat"   → GET /messages
```

The gateway extracts the first path segment as the namespace, looks up the service, and proxies the request via the service's Unix socket.

### WebSocket Routing

WebSocket connections are routed to the service whose `refName` matches the connection path:

```
ws://host/chat    → Service "chat"
```

Once connected, WebSocket events are routed through NATS. Each service registers its event handlers, and the gateway dispatches events to the correct service instance.

### Custom Routes

Define custom proxy routes for external services or advanced routing:

```json
{
  "routes": [
    {
      "path": "/cdn/*",
      "target": "http://localhost:9000"
    },
    {
      "path": "/auth/*",
      "target": "https://auth.example.com",
      "path_rewrite": { "/auth": "" }
    }
  ]
}
```

## Service Registration Flow

When a Linebridge service starts in gateway mode (`LB_GATEWAY_SOCKET` is set):

1. The service connects to NATS (via `NatsAdapter`)
2. Creates an IPC client connected to the gateway's Unix socket
3. Collects all registered HTTP routes and WebSocket events
4. Sends a `service:register` event via IPC

**Registration payload:**

```json
{
  "event": "service:register",
  "data": {
    "namespace": "api",
    "secure": false,
    "http": {
      "enabled": true,
      "proto": "http",
      "paths": ["/users", "/users/:id", "/health"]
    },
    "websocket": {
      "enabled": true,
      "proto": "ws",
      "path": "api",
      "events": ["chat:message", "user:typing"]
    },
    "listen": {
      "ip": "0.0.0.0",
      "port": 3000,
      "socket": "/tmp/lb_node_api.sock"
    }
  }
}
```

The gateway receives this, stores the route mappings, and configures the service's socket client for HTTP proxying.

## Service Management

### Auto-discovery

The gateway scans the working directory for services. A valid service directory contains an `index.ts` (or `index.js`) file. The directory name becomes the service ID (namespace).

```
services/api/index.ts     → Service ID: "api"
services/chat/index.ts    → Service ID: "chat"
```

### Hot Reload (dev mode)

In `"dev"` mode, the gateway watches service directories for file changes. When a change is detected, it automatically restarts the affected service.

### Auto-restart

If a service crashes, the gateway restarts it after a 1-second delay. On shutdown, auto-restart is disabled and services receive `SIGINT` (2s grace period before `SIGKILL`).

### Bootloader

The gateway uses the Linebridge bootloader to start each service. By default, it auto-detects the bootloader at `node_modules/linebridge/bootloader/bin`. Set `services.bootloader` for a custom path.

## WebSocket & NATS

The gateway's WebSocket layer is built on [gws](https://github.com/lxzan/gws) and integrates with NATS for distributed pub/sub. Key operations proxy through NATS:

| Operation | Mechanism |
|-----------|-----------|
| `subscribe(topic)` | NATS subscription for topic messages |
| `unsubscribe(topic)` | NATS subscription removal |
| `toTopic(topic, event, data)` | NATS publish to topic |
| `sendToUserId(userId, event, data)` | NATS publish targeted to user |
| `findClientsByUserId(userId)` | NATS request-reply across all instances |

## JavaScript Plugins (Scripts)

Gateway plugins are JavaScript files executed in a Goja-based JSVM. They have access to the WebSocket manager for advanced event handling:

```json
{
  "scripts": [
    { "path": "plugins/auth.js", "crash_if_failed": false },
    { "path": "plugins/logger.js", "crash_if_failed": true }
  ]
}
```

## Control API

An optional management API runs on a separate port (default `:9090`):

```json
{
  "control_api": {
    "enabled": true,
    "listen": "127.0.0.1:9090"
  }
}
```

## OpenTelemetry

Enable distributed tracing and logging via OTLP:

```json
{
  "otel": {
    "enabled": true,
    "name": "lb-gateway",
    "endpoint": "localhost:4317"
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEBUG` | Enable debug logging (`true`) |
| `INFISICAL_CLIENT_ID` | Infisical client ID for secrets injection |
| `INFISICAL_CLIENT_SECRET` | Infisical client secret |
| `INFISICAL_PROJECT_ID` | Infisical project ID |
| `ROOT_PATH` | Set automatically to the working directory |

### Infisical Integration

When `INFISICAL_*` environment variables are set, the gateway loads secrets from Infisical at startup. JWT secrets and ECDSA keys from Infisical automatically override the config file values.

## Docker

```dockerfile
FROM node:24-alpine
COPY --from=install /usr/local/bin/ultragateway /usr/local/bin/ultragateway
COPY . /app
WORKDIR /app
RUN npm install
CMD ["ultragateway", "."]
```
