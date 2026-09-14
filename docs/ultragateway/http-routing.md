# HTTP Routing

## Server Stack

The gateway uses [Hertz](https://github.com/cloudwego/hertz) as its HTTP engine with the following configuration:

- Max request body: 25 MB
- Disabled pre-parse multipart form (manual handling)
- Disabled route printing at startup
- HTTP/2 support via ALPN when TLS is configured
- pprof debug endpoints in debug mode

## Middleware

The `MainMiddleware` runs on every request and sets:

| Header | Value |
|--------|-------|
| `lb-ultrawg` | Gateway version |
| `Server` | Removed (security) |
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Headers` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, DELETE, PUT, PATCH, OPTIONS` |
| `Content-Type` | `application/json` |

In debug mode, the middleware logs: `METHOD STATUS /path duration`.

## Route Table

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/` | `Index` | Gateway metadata (name, version, uptime, sys info, package.json) |
| `HEAD` | `/` | `Ping` | Health check (200 OK) |
| `GET` | `/ping` | `Ping` | Health check (200 OK) |
| `GET` | `/ws` | `Websocket` | WebSocket upgrade endpoint |
| `ANY` | `/*path` | `ProxyHandler` | Catch-all: routes to services by namespace |
| `ANY` | custom | `CustomRoute` | User-defined proxy routes |

## Proxy Handler

The `ProxyHandler` processes all unmatched requests (`ANY /*path`):

1. Returns `204 No Content` for `OPTIONS` requests
2. Extracts the **namespace** from the first URL path segment
   ```
   /api/users/123  →  namespace = "api"
   /chat/messages  →  namespace = "chat"
   ```
3. Looks up the namespace in `HttpPathsRefs` (populated by service registration)
4. Maps the namespace to a service ID and retrieves the service
5. Gets the service's Unix socket client (created when the service registers its listen socket)
6. Copies the request to a fresh Hertz protocol request
7. Strips hop-by-hop headers: `Connection`, `Proxy-Connection`, `Keep-Alive`, `TE`, `Trailer`, `Transfer-Encoding`, `Upgrade`
8. Forwards the request over the Unix socket with a 30-second timeout
9. Copies the response back to the client

### Namespace Resolution

```
Client request: GET /api/users/123

1. Namespace: "api"
2. HttpPathsRefs["api"] → "api" (service ID)
3. Services["api"] → *Service instance
4. service.GetSocketClient() → Hertz client over Unix socket
5. Forward: GET /users/123 → socket
```

## Custom Routes

Custom routes are defined in `gateway.config.json` under `routes`. They bypass the namespace routing and proxy directly to an external URL.

### Route Matching

Custom routes use Hertz's path matching. Each route creates a dedicated Hertz reverse proxy client:

```go
// For each custom route:
client, _ := client.NewClient(
    client.WithDialTimeout(10 * time.Second),
    client.WithMaxConnsPerHost(100),
    client.WithKeepAlive(true),
    client.WithTLSConfig(tlsConfig),  // for HTTPS targets
)
srv.Any(route.Path, handler.exec)
```

### Path Rewrite

The `path_rewrite` field strips prefixes before forwarding:

```json
{
  "path": "/auth/*",
  "target": "https://auth.example.com",
  "path_rewrite": { "/auth": "" }
}
```

```
Client: GET /auth/login
Gateway rewrites: GET /login
Forwards to: https://auth.example.com/login
```

### WebSocket Custom Routes

When `"websocket": true`, the custom route also proxies WebSocket upgrade requests to the target.

## Health Check

```
GET /ping  →  200 OK
HEAD /     →  200 OK
```

## Root Endpoint

`GET /` returns gateway metadata:

```json
{
  "gateway": "lb-ultrawg",
  "lb_version": "exp-20240610",
  "uptime": "2h34m12s",
  "sys_info": {
    "os": "linux",
    "arch": "amd64",
    "go_version": "go1.22",
    "cpu_cores": 8
  },
  "version": "1.0.0",
  "name": "my-project"
}
```
