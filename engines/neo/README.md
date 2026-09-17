# @linebridge/engine-neo

The official, high-performance HTTP and WebSocket engine for [Linebridge](https://github.com/ragestudio/linebridge), built on top of [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js).

## Installation

```bash
npm install @linebridge/engine-neo
```

## Usage

This engine is automatically loaded by the Linebridge framework when `useEngine` is set to `"neo"` (the default).

To get full TypeScript inference, add the following to your `env.d.ts` file:

```ts
import "@linebridge/engine-neo"
```

## License

This project is licensed under the **MIT License**.

It includes software developed by uNetworking AB and uWebSockets.js contributors, which is licensed under the **Apache License 2.0**.
See the [LICENSE](./LICENSE) file for more details.
