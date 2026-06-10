# Configuration

The gateway reads `gateway.config.json` from the project root at startup. All fields are optional except `ipc.path`.

## Full Schema

```json
{
  "mode": "dev",
  "http": {
    "port": 3000,
    "secure_port": 3443,
    "certificates": {
      "cert": "/etc/ssl/fullchain.pem",
      "key": "/etc/ssl/privkey.pem"
    }
  },
  "ipc": {
    "path": "/tmp/lb-gateway.sock"
  },
  "services": {
    "bootloader": ""
  },
  "jwt": {
    "secret": "",
    "private_key": "/etc/ssl/ecdsa-private.pem",
    "public_key": "/etc/ssl/ecdsa-public.pem",
    "use_keys": [
      { "key": "user_id", "type": "string" },
      { "key": "role", "type": "string" }
    ]
  },
  "scripts": [
    { "path": "plugins/auth.js", "crash_if_failed": false }
  ],
  "routes": [
    { "path": "/cdn/*", "target": "http://localhost:9000" }
  ],
  "control_api": {
    "enabled": false,
    "listen": ":9090"
  },
  "otel": {
    "enabled": false,
    "name": "lb-gateway",
    "endpoint": "localhost:4317",
    "headers": ""
  }
}
```

---

## `mode`

| Value | Behavior |
|-------|----------|
| `"dev"` | Enables file watchers for hot-reload on all services |
| `"prod"` | No file watchers (default if empty) |

---

## `http`

### `port`
HTTP listen port. The gateway binds to `0.0.0.0:port`.

### `secure_port`
HTTPS listen port. When set together with `certificates`, enables a second TLS server on this port with HTTP/2 (ALPN + h2).

### `certificates`
TLS configuration. Both `cert` and `key` must be valid PEM file paths.

When TLS is configured:
- An additional HTTPS server starts on `secure_port`
- HTTP/2 is enabled via ALPN and the h2 protocol factory
- The HTTP server on `port` remains plaintext

---

## `ipc`

### `path`
**Required.** Unix domain socket path for inter-service communication.

Every Linebridge service connects to this socket to:
1. Register its HTTP routes and WebSocket events
2. Receive proxied HTTP requests from the gateway

The gateway creates the socket directory if it doesn't exist and sets permissions to `0666`.

---

## `services`

### `bootloader`
Path to the Linebridge bootloader executable. Default behavior:

1. If empty: auto-detects `node_modules/linebridge/bootloader/bin`
2. If the auto-detected path doesn't exist: gateway fails to start
3. If set: uses the specified path

The bootloader is invoked as:
```bash
<bootloader> <service-main-file>
```

---

## `jwt`

JWT configuration for WebSocket authentication.

### `secret`
HMAC secret for symmetric JWT signing (HS256).

### `private_key` / `public_key`
ECDSA key paths for asymmetric JWT (ES256). Both keys are parsed at startup into `*ecdsa.PrivateKey` / `*ecdsa.PublicKey` for use with `golang-jwt`.

### `use_keys`
JWT claims to extract as connection metadata after successful authentication.

Each entry has:
- `key` — the JWT claim name (e.g. `"user_id"`, `"role"`)
- `type` — the value type: `"string"` or `"bool"`

The extracted values are stored in `WSConnectionCtx.Meta` and forwarded as NATS headers on every message. This allows downstream services to access user identity without decoding the token again.

Example flow:
```json
// JWT payload: { "user_id": "abc123", "role": "admin" }
// use_keys: [{ "key": "user_id", "type": "string" }, { "key": "role", "type": "string" }]

// Result: connCtx.Meta = { "user_id": "abc123", "role": "admin" }
// Every WS message includes NATS headers: user_id=abc123, role=admin
```

---

## `scripts`

JavaScript plugins executed in a Goja-based JSVM (ES5.1 compatible).

### Entry format
```json
{
  "path": "plugins/my-plugin.js",
  "crash_if_failed": false
}
```

Scripts are loaded before services start. The JSVM has access to the WebSocket manager via the global context. See [Architecture](./architecture#jsvm-plugins) for the plugin API.

---

## `routes`

Custom HTTP proxy routes for external services.

### Entry format
```json
{
  "path": "/api/*",
  "target": "http://backend:8080",
  "path_rewrite": { "/api": "" },
  "websocket": false
}
```

| Field | Description |
|-------|-------------|
| `path` | Route pattern. Supports Hertz wildcard syntax (`*`) |
| `target` | Upstream URL. HTTPS targets skip TLS verification |
| `path_rewrite` | Strip path prefixes before forwarding |
| `websocket` | Enable WebSocket upgrade proxying |

Each custom route creates a dedicated Hertz client with:
- 10-second dial timeout
- 100 max connections per host
- Keep-alive enabled
- TLS config for HTTPS targets

---

## `control_api`

A secondary HTTP server for management endpoints.

### `enabled`
When `true`, starts a Hertz server on the configured listen address.

### `listen`
Listen address (default `:9090`). Example: `"127.0.0.1:9090"` to restrict to localhost.

Endpoints:
- `GET /` — returns `{ "message": "Control API is running" }`

---

## `otel`

OpenTelemetry integration for distributed tracing and logging.

### `enabled`
When `true`, initializes OTLP trace and log providers at startup.

### `name`
Service name for traces. Defaults to the gateway binary name.

### `endpoint`
OTLP collector address (gRPC). Example: `"localhost:4317"`.

### `headers`
Additional gRPC metadata headers for the OTLP exporter.

The gateway creates spans for:
- HTTP requests (middleware timing)
- WebSocket connections (open, close)
- WebSocket messages (event routing)
- NATS IPC messages (publish and handle)
- NATS operations (subscribe, unsubscribe, find clients)
