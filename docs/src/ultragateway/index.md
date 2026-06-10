# Ultragateway

The **Linebridge Gateway** (`ultragateway`) is a standalone Go binary that orchestrates multiple Linebridge services into a distributed service mesh.

## Quick Links

- [Installation](./installation) — download and setup
- [Configuration](./configuration) — full `gateway.config.json` reference
- [Architecture](./architecture) — internal design and data flow
- [HTTP Routing](./http-routing) — request proxying and routing
- [WebSocket](./websocket) — real-time connections and NATS operations
- [IPC Protocol](./ipc-protocol) — Unix socket communication
- [Services](./services) — service lifecycle and hot-reload
- [NATS Internals](./nats) — embedded NATS and JetStream

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Go |
| HTTP Server | [Hertz](https://github.com/cloudwego/hertz) |
| HTTP/2 | Hertz + h2 factory |
| WebSocket | [gws](https://github.com/lxzan/gws) |
| Message Broker | Embedded [NATS](https://nats.io) + JetStream |
| IPC | Unix domain sockets |
| JS Runtime | [Goja](https://github.com/dop251/goja) (ES5.1) |
| Tracing | OpenTelemetry (OTLP) |
| Config | `gateway.config.json` |
| Secrets | Infisical integration |
