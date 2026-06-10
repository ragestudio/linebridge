# Bootloader

`linebridge-boot` is the default command to start a Linebridge service. It handles environment setup, JIT transpilation, and path aliases so you can write TypeScript, ESM, or CommonJS without a build step.

## Usage

The recommended approach is to define npm scripts in your `package.json`:

```json
{
  "scripts": {
    "dev": "linebridge-boot index.ts --watch",
    "prod": "linebridge-boot index.ts"
  }
}
```

```bash
# Development with hot-reload
npm run dev

# Production
npm run prod

# With custom port
LB_PORT=8080 npm run prod
```

Using npm scripts ensures the bootloader is resolved from the local `node_modules/.bin` and keeps the startup command consistent across environments. You can also invoke it directly:

```bash
npx linebridge-boot index.ts
```

## What It Does

When you run `linebridge-boot`, the bootloader executes these steps in order:

1. **`.env` loading** — reads `.env` from the working directory via `dotenv`
2. **Path resolution** — resolves the main module to an absolute path
3. **Alias setup** — registers path aliases for clean imports
4. **Sucrase transpiler** — registers `sucrase/register` for JIT compilation
5. **Global utilities** — injects `Boot()`, `ToBoolean()`, `nanoid()`, etc.
6. **Module execution** — runs your main module via `Module.runMain()`

## JIT Transpilation

The bootloader uses [Sucrase](https://github.com/alangpierce/sucrase) to transpile TypeScript and ESM on-the-fly. This means:

- **No build step needed** — write `.ts` files directly
- **ESM and CommonJS** — both module systems work
- **TypeScript syntax** — types are stripped, JS is executed directly
- **Instant startup** — no `tsc` compilation, no `ts-node` overhead

```ts
// index.ts — runs directly without compilation
import { Server } from "linebridge"

export default class API extends Server {
  static refName = "api"
}

Boot(API)
```

## Path Aliases

The bootloader registers these aliases automatically:

| Alias | Resolves to |
|-------|------------|
| `@` | Main module's directory (e.g. `src/`) |
| `@classes` | `src/classes/` |
| `@middlewares` | `src/middlewares/` |
| `@routes` | `src/routes/` |
| `@models` | `src/models/` |
| `@config` | `src/config/` |
| `@utils` | `src/utils/` |
| `@lib` | `src/lib/` |

Shared resources (relative to project root):
| Alias | Resolves to |
|-------|------------|
| `@db` | `db/` |
| `@db_models` | `db_models/` |
| `@shared-classes` | `classes/` |
| `@shared-middlewares` | `middlewares/` |
| `@shared-utils` | `utils/` |
| `@shared-lib` | `lib/` |

Usage in route files:

```ts
// Instead of relative imports:
import type API from "../../index"

// Use the @ alias:
import type API from "@/index"
```

## Global Utilities

The bootloader injects these globals:

### `Boot(ServerClass)`
Instantiates and starts a server:

```ts
Boot(MyAPI)
// Equivalent to:
// const instance = new MyAPI()
// instance.run()
```

### `ToBoolean(value)`
Converts string or boolean to boolean:

```ts
ToBoolean("true")   // true
ToBoolean("false")  // false
ToBoolean(true)     // true
```

### `nanoid(length?)`
Generates a cryptographically random ID (default 21 chars):

```ts
const id = nanoid()     // "V1StGXR8_Z5jdHi6B-myT"
const short = nanoid(10) // "V1StGXR8_Z"
```

### `b64Encode(data)` / `b64Decode(data)`
Base64 encode/decode:

```ts
b64Encode("hello")        // "aGVsbG8="
b64Decode("aGVsbG8=")    // "hello"
```

### `Array.updateFromObjectKeys(obj)`
Updates array elements from an object's matching keys:

```ts
const fields = ["name", "email"]
fields.updateFromObjectKeys({ name: "John", email: "john@test.com", extra: true })
// fields → ["John", "john@test.com"]
```

### `isProduction`
Boolean, `true` when `NODE_ENV=production`.

### `defineRoute`
Type-safe route definition function. See [Routes & Handlers](/guide/routes).

### `OperationError`
Error class for HTTP error responses. See [OperationError API](/api/operation-error).

## File Watcher (`--watch`)

The `--watch` flag enables hot-reload during development:

```bash
npx linebridge-boot index.ts --watch
```

When enabled:
1. The bootloader forks a child process running your service
2. A file watcher monitors the main module's directory for changes
3. On file change, the child process is killed and restarted (300ms debounce)
4. Ignores `node_modules`, `.cache`, `dist`, hidden files, and temp files

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` or `development` |
| `LB_PORT` | Override the listen port |
| `ROOT_PATH` | Project root path (auto-detected if not set) |
| `LB_GATEWAY_SOCKET` | Gateway IPC socket path (enables gateway mode) |
| `LB_SOCKET_MODE` | Enable Unix socket mode instead of TCP |
| `KEEP_UWS_HEADER` | Keep the uWS `Server` header |

## Standalone vs Gateway

- **Standalone**: `linebridge-boot index.ts` — service listens on a TCP port
- **Gateway mode**: The gateway spawns `linebridge-boot` for each service, setting `LB_GATEWAY_SOCKET` and `LB_SOCKET_MODE=true`. Services listen on Unix sockets instead of TCP.

In both cases, the bootloader provides the same environment: aliases, transpiler, and globals.
