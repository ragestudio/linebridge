# Gateway Configuration

Reference for the `gateway.config.json` file used by the [Linebridge Gateway](/guide/gateway).

## BaseConfig

```go
type BaseConfig struct {
    Mode       string           `json:"mode"`
    Http       HttpConfig       `json:"http"`
    IPC        IPCConfig        `json:"ipc"`
    Services   ServicesConfig   `json:"services"`
    JWT        JWTConfig        `json:"jwt"`
    Scripts    []ScriptConfig   `json:"scripts"`
    Routes     []CustomRoute    `json:"routes"`
    ControlAPI ControlAPIConfig `json:"control_api"`
    OTEL       OTELConfig       `json:"otel"`
}
```

## HttpConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | — | HTTP listen port |
| `secure_port` | `number` | — | HTTPS listen port |
| `certificates.cert` | `string` | — | TLS certificate file path |
| `certificates.key` | `string` | — | TLS private key file path |

When `certificates` are configured, the gateway enables TLS and HTTP/2 (via ALPN).

## IPCConfig

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Unix socket path for service IPC (e.g. `/tmp/lb-gateway.sock`) |

All services connect to this socket to register themselves and receive proxied HTTP requests.

## ServicesConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bootloader` | `string` | auto-detected | Path to Linebridge bootloader binary. Defaults to `node_modules/linebridge/bootloader/bin` |

## JWTConfig

| Field | Type | Description |
|-------|------|-------------|
| `secret` | `string` | HMAC JWT signing secret |
| `private_key` | `string` | ECDSA private key PEM file path |
| `public_key` | `string` | ECDSA public key PEM file path |
| `use_keys` | `array` | Additional JWT verification keys |

ECDSA keys are parsed at startup and available for WebSocket authentication. When Infisical integration is enabled, `JWT_SECRET`, `ECDSA_PRIVATE_KEY_B64`, and `ECDSA_PUBLIC_KEY_B64` environment variables override the config values.

## ScriptConfig

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Path to JavaScript plugin file (relative to project root) |
| `crash_if_failed` | `boolean` | If `true`, the gateway crashes if the script fails to load |

Scripts run in a Goja-based JSVM with access to the WebSocket manager:

```js
// plugins/auth.js
module.exports = function(ctx) {
  // ctx.websocketManager available
}
```

## CustomRoute

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Route pattern (e.g. `/api/*`, `/cdn/*`) |
| `target` | `string` | Proxy target URL |
| `path_rewrite` | `object` | Path prefix rewrite rules (e.g. `{"/api": ""}`) |
| `websocket` | `boolean` | Enable WebSocket proxying for this route |

Custom routes use Hertz's reverse proxy client with keep-alive and connection pooling.

## ControlAPIConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable the control API server |
| `listen` | `string` | `":9090"` | Listen address for the control API |

## OTELConfig

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Enable OpenTelemetry |
| `name` | `string` | Service name for traces and logs |
| `endpoint` | `string` | OTLP collector endpoint (e.g. `localhost:4317`) |
| `headers` | `string` | Additional OTLP headers |
