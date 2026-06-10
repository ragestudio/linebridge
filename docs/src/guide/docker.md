# Docker & Deployment

Linebridge applications can be packaged as Docker containers for both standalone and gateway-based deployments.

> **glibc required**: uWebSockets.js (the Neo engine) links against glibc and is **not compatible with musl libc**. Alpine-based images (`node:*-alpine`) will fail at runtime. Always use Debian-based images (`node:24`, `node:24-slim`, or `ragestudio/ultragateway`). The `ragestudio/ultragateway` image is based on Debian Trixie Slim and includes Node.js + ultragateway pre-installed.

> **Bootloader in containers**: Define an npm script (`"prod": "linebridge-boot index.ts"`) and use `CMD ["npm", "run", "prod"]`. The bootloader (should be at `node_modules/.bin/linebridge-boot`) handles `.env` loading, TypeScript/ESM JIT transpilation via Sucrase, and path aliases — your TypeScript source runs without a build step. See the [Bootloader guide](./bootloader).

## Base Images

| Image | libc | Description |
|-------|------|-------------|
| `node:24` | glibc | Debian-based, full Node.js image |
| `node:24-slim` | glibc | Smaller Debian variant (recommended for standalone) |
| `ragestudio/ultragateway:latest` | glibc | Debian Trixie Slim + ultragateway + Node.js 24 |

### Why Not Alpine?

| libc | Image | uWebSockets.js | Status |
|------|-------|---------------|--------|
| musl | `node:24-alpine` | ❌ Fails at runtime | Do not use |
| glibc | `node:24-slim` | ✅ Works | Use this |

uWebSockets.js ships prebuilt native binaries linked against glibc. The musl-based Alpine libc is ABI-incompatible, causing immediate crashes on startup. If you need a minimal image, use `node:24-slim` (~70 MB) which is glibc-based.

## Standalone Deployment

A single Linebridge service without the gateway. Uses `linebridge-boot` to start the service with JIT transpilation — no build step needed.

### Dockerfile

```dockerfile
FROM node:24-slim

WORKDIR /app

# Install dependencies (linebridge includes the bootloader)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source (TypeScript, no compilation needed — bootloader handles it)
COPY . .

# Required: define "prod" script in package.json:
#   "scripts": { "prod": "linebridge-boot index.ts" }

EXPOSE 3000

CMD ["npm", "run", "prod"]
```

### compose.yml

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### .dockerignore

```
node_modules
.git
dist
.cache
```

---

## Gateway Deployment

Multiple services orchestrated by the Linebridge Gateway.

### Project Structure for Docker

```
my-project/
├── gateway.config.json
├── package.json
├── services/
│   ├── api/
│   │   ├── index.ts
│   │   └── routes/
│   └── chat/
│       ├── index.ts
│       └── routes/
├── Dockerfile
├── docker-compose.yml
└── .dockerignore
```

### Dockerfile

```dockerfile
FROM ragestudio/ultragateway:latest

WORKDIR /app

# Copy project files
COPY . .

# Install project dependencies
RUN npm install

# Fix permissions for the node user
RUN chown -R node:node /app

USER node

EXPOSE 3000

CMD ["ultragateway", "."]
```

### docker-compose.yml

```yaml
services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./services:/app/services:ro
      - ./gateway.config.json:/app/gateway.config.json:ro
      - nats-data:/app/nats-data
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  nats-data:
```

For development with hot-reload, mount the services directory and set `mode: "dev"`:

```yaml
services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./services:/app/services        # rw for hot-reload
      - ./gateway.config.json:/app/gateway.config.json:ro
      - ./node_modules:/app/node_modules  # pre-installed
      - nats-data:/app/nats-data
    environment:
      - NODE_ENV=development

volumes:
  nats-data:
```

---

## Multi-Stage Build (Optimized)

Uses a build stage for `npm ci` + prune, then copies to the glibc-based runtime:

```dockerfile
# ── Build stage ──────────────────────────────────────────
FROM node:24-slim AS build

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Prune dev dependencies
RUN npm prune --omit=dev

# ── Runtime stage ───────────────────────────────────────
FROM ragestudio/ultragateway:latest

WORKDIR /app

# Copy only what's needed
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/services ./services
COPY --from=build /build/gateway.config.json ./
COPY --from=build /build/package.json ./

RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["ultragateway", "."]
```

---

## Environment Variables for Containers

### Gateway

| Variable | Description |
|----------|-------------|
| `DEBUG` | Enable debug logging (`true`) |
| `NODE_ENV` | `production` or `development` |
| `INFISICAL_CLIENT_ID` | Infisical secrets injection |
| `INFISICAL_CLIENT_SECRET` | Infisical secret |
| `INFISICAL_PROJECT_ID` | Infisical project ID |

### Service (injected by gateway)

The gateway automatically sets these for each service:

| Variable | Value |
|----------|-------|
| `LB_SOCKET_MODE` | `true` |
| `LB_GATEWAY_SOCKET` | Gateway's IPC socket path |

---

## Docker Compose: Gateway + External NATS

If you prefer an external NATS server instead of the embedded one:

```yaml
services:
  nats:
    image: nats:2.10-alpine
    command: "--jetstream --store_dir /data"
    volumes:
      - nats-data:/data
    ports:
      - "4222:4222"

  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NATS_URL=nats://nats:4222
    depends_on:
      - nats
    volumes:
      - ./gateway.config.json:/app/gateway.config.json:ro
    restart: unless-stopped

volumes:
  nats-data:
```

> **Note**: The embedded NATS server is recommended for simplicity. An external NATS is only needed if you want to share the NATS cluster across multiple gateway instances. NATS itself (Go binary) works fine on Alpine.

---

## Docker Compose: TLS / HTTPS

```yaml
services:
  gateway:
    build: .
    ports:
      - "3000:3000"
      - "3443:3443"
    volumes:
      - ./gateway.config.json:/app/gateway.config.json:ro
      - ./certs:/etc/ssl:ro
      - nats-data:/app/nats-data
    restart: unless-stopped

volumes:
  nats-data:
```

With `gateway.config.json`:

```json
{
  "http": {
    "port": 3000,
    "secure_port": 3443,
    "certificates": {
      "cert": "/etc/ssl/fullchain.pem",
      "key": "/etc/ssl/privkey.pem"
    }
  }
}
```

---

## Health Checks

### Standalone

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/ping"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### Gateway

```yaml
services:
  gateway:
    build: .
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/ping"]
      interval: 30s
      timeout: 5s
      retries: 3
```

---

## Production Checklist

- [ ] Use a **glibc-based image** (`node:24-slim` or `ragestudio/ultragateway`), never Alpine
- [ ] Set `NODE_ENV=production`
- [ ] Set `mode: "prod"` in `gateway.config.json` (disables file watchers)
- [ ] Mount `gateway.config.json` as read-only
- [ ] Mount service code as read-only in production
- [ ] Define an npm `"prod"` script: `"prod": "linebridge-boot index.ts"` and use `CMD ["npm", "run", "prod"]`
- [ ] Use a volume for `nats-data` to persist across restarts
- [ ] Configure health checks
- [ ] Set resource limits (`deploy.resources.limits`)
- [ ] Use `restart: unless-stopped` or `restart: always`
- [ ] Run as non-root user (`USER node`)
- [ ] Pin image versions in production (`ragestudio/ultragateway:2.0` not `:latest`)
