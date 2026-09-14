# Plugins

Plugins extend Linebridge's functionality. They are loaded at startup and can hook into the server lifecycle, add middlewares, and inject strongly-typed contexts into routes.

## Plugin Interface

```ts
interface ServerPlugin {
  contexts?: Record<string, any>
  initialize?: () => Promise<void>
}
```

A plugin is a class that receives the `Server` instance in its constructor. It can optionally expose a `contexts` property (which gets automatically injected and typed in all routes) and an `initialize` method for setup logic.

## Creating a Plugin

```ts
// src/plugins/MyPlugin.ts
import type { Server, ServerPlugin } from "linebridge"

export default class MyPlugin implements ServerPlugin {
  private server: Server

  // 1. Expose contexts that this plugin provides.
  // The type of this property is automatically extracted by Linebridge!
  contexts = {
    myPluginData: { version: "1.0.0" }
  }

  constructor(server: Server) {
    this.server = server
  }

  async initialize() {
    console.log(`Plugin loaded for ${this.server.params.refName}`)

    // Register a global middleware dynamically
    this.server.middlewares["myPluginMiddleware"] = async (req, res, next) => {
      console.log("Plugin middleware running")
      next()
    }

    // Listen to server events
    this.server.eventBus.on("server:ready", () => {
      console.log("Server is ready!")
    })
  }
}
```

## Loading Plugins

Plugins are registered by assigning them to the `static usePlugins` array in your `Server` subclass:

```ts
// src/index.ts
import { Server } from "linebridge"
import MyPlugin from "./plugins/MyPlugin"

export default class MyAPI extends Server {
  static usePlugins = [MyPlugin]
}
```

## TypeScript Auto-Inference

The real power of `usePlugins` is that Linebridge analyzes the `contexts` property of every plugin passed to the array. 

When you use `defineRoute`, your plugin contexts are natively available with full autocompletion and type-checking — zero boilerplate required!

```ts
// src/routes/test.ts
import { defineRoute } from "linebridge"
import MyAPI from "../index"

export default defineRoute(MyAPI)({
  // "myPluginData" is automatically suggested here!
  useContexts: ["myPluginData"],
  fn: async (req, res, ctx) => {
    // ctx.myPluginData is fully typed as { version: string }
    return res.json(ctx.myPluginData)
  }
})
```

## Plugin Lifecycle

Plugins are initialized during the engine boot phase, after core setup but before routes are registered:

1. Instantiated with `new Plugin(server)`.
2. `plugin.initialize()` is called (if defined).
3. If `plugin.contexts` is an object, they are merged into `server.contexts`.
4. Stored in the `server.plugins` Map (accessible via `server.plugins.get("MyPlugin")`).

## Use Cases

| Use Case | Implementation |
|----------|---------------|
| Database connections | Initialize connection pool in `initialize()`, expose via `contexts` |
| Authentication | Register auth middleware and user resolution logic |
| Monitoring | Listen to server events, expose metrics endpoints |
| Feature flags | Load configuration and expose via `contexts` |
