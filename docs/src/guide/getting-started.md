# Getting Started

Linebridge is a multiproposal server framework designed to build fast, scalable, and secure backend services. It uses [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js) as its default engine, providing bare-metal HTTP/HTTPS/WebSocket performance.

## Requirements

- **Node.js** >= 24.0.0
- **Operating System**: Linux or macOS (Windows only via WSL)
- **npm**

The `Neo` engine and Gateway rely on Linux-specific features (unix sockets, process signals, libc). Windows is not supported natively — use [WSL](https://learn.microsoft.com/en-us/windows/wsl/) if you develop on Windows.

Also is needed to run on GLibc-based systems, MUSL-based systems (Alpine Linux...) are not supported.

## Installation

```bash
npm install linebridge
```

## Your First Server

Create an `index.ts` file:

```ts
import { Server } from "linebridge"

export default class MyAPI extends Server {
  static refName = "my-api"
  static listenPort = 3000
}

Boot(MyAPI)
```

Then boot it:

```bash
npx linebridge-boot index.ts
```

Your server will start on `http://0.0.0.0:3000`. The root endpoint `GET /` returns server metadata, and `GET /_map` returns the full route map.

## Project Structure

A typical Linebridge project follows this layout:

```
my-project/
├── index.ts              # entry point, defines Server subclass
├── routes/               # file-based HTTP route definitions
│   └── users/
│       └── get.ts
├── ws_routes/            # file-based WebSocket event definitions
│   └── chat:message.ts
├── middlewares/          # custom middleware modules
├── classes/              # custom classes and utilities
├── lb-plugins/           # linebridge plugins directory
├── package.json
└── tsconfig.json
```

## Bootloader

The bootloader (`linebridge-boot`) handles `.env` loading, TypeScript/ESM JIT transpilation via Sucrase, path aliases (`@`, `@classes`, etc.), and global utilities (`Boot()`, `ToBoolean()`, `nanoid()`). See the [Bootloader guide](./bootloader) for the full reference.

### Path Aliases

The bootloader automatically registers these aliases. See the [Bootloader guide](./bootloader#path-aliases) for the complete list.

| Alias | Resolves to |
|-------|------------|
| `@` | `src/` directory |

You can also use `registerBaseAliases()` manually if not using the bootloader.
