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
npm install linebridge @linebridge/cli @linebridge/engine-neo
```

> **Note:** Linebridge delegates the HTTP/WebSocket execution to an external engine. `@linebridge/engine-neo` is the recommended default engine built on top of `uWebSockets.js`.

### TypeScript Setup

Linebridge's engine typings are completely dynamic. To inject the types of the engine you installed (like Neo) across your entire project without polluting your source code with imports, create an `env.d.ts` file in the root of your project:

```ts
// env.d.ts
import "@linebridge/engine-neo"
```

_TypeScript will automatically discover this file and inject global tools and `NeoRequest`/`NeoResponse` types into all your routes and middlewares._

## Your First Server

Create an `index.ts` file:

```ts
import { Server } from "linebridge"

// Make sure the target Server is exported by default so the bootloader can find it
export default class MyAPI extends Server {
	static refName = "my-api"
	static listenPort = 3000
}
```

Then boot it:

```bash
npx linebridge boot index.ts
```

Your server will start on `http://0.0.0.0:3000`. The root endpoint `GET /` returns server metadata, and `GET /_map` returns the full route map.

## Project Structure

A typical Linebridge project follows this layout:

```
my-project/
├── env.d.ts              # injects global typings for your engine & bootloader
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

## Bootloader and CLI

The bootloader (`linebridge-boot` or `linebridge boot`) handles `.env` loading, TypeScript/ESM JIT transpilation via `tsx` (esbuild), path aliases (`@`, `@classes`, etc.). See the [Bootloader guide](./bootloader) for the full reference.

### Path Aliases

The bootloader automatically registers these aliases. See the [Bootloader guide](./bootloader#path-aliases) for the complete list.

| Alias | Resolves to      |
| ----- | ---------------- |
| `@`   | `src/` directory |
