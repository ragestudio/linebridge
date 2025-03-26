<img
    src="https://raw.githubusercontent.com/ragestudio/linebridge/refs/heads/master/resources/linebridge-color-b.svg"
    width="100%"
    height="150px"
/>
# Linebridge
A multiproposal framework to build fast, scalable, and secure servers.

Currently used on RageStudio's services backends, like [Comty](https://github.com/ragestudio/comty)

## Suported Engines
- [hyper-express](https://github.com/kartikk221/hyper-express) (default) | High Performance Node.js Webserver.
- worker | IPC Worker for sharding and efficient multi-threading.

## Features
- Multiproposal architecture | Designed to adapt to different project needs.
- Modular and Extensible | Easily add or replace components as needed.
- 🚀 Fast & Scalable | Optimized for performance under high traffic.
- 🔐 Secure by Default | Security-focused setup right out of the box.
- 📡 Supports WebSockets | Real-time communication ready.
- 📦 Multi-Protocol Support | Communicate over multiple protocols effortlessly.
- 🔧 Built-in Transcompiler | Automatically transcompiles code on boot for smoother deployment.

## Getting Started
### Installation
```bash
npm install linebridge
```
> [!WARNING]
> If you're using Yarn, you might encounter installation issues. We recommend using npm.

### Boot the server
```bash
linebridge-boot index.js
```

### Examples & docs
[create-http-server-example](../docs/server/create-http-server-example.md)
