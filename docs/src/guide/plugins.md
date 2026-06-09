# Plugins

Plugins extend Linebridge's functionality. They are loaded at startup and can hook into the server lifecycle.

## Plugin Interface

```ts
interface ServerPlugin {
  initialize?: () => Promise<void>
}
```

A plugin is a class (or module) that receives the `Server` instance and optionally implements an `initialize` method.

## Creating a Plugin

```ts
// lb-plugins/my-plugin/index.ts
import type { Server, ServerPlugin } from "linebridge"

export default class MyPlugin implements ServerPlugin {
  private server: Server

  constructor(server: Server) {
    this.server = server
  }

  async initialize() {
    console.log(`Plugin loaded for ${this.server.params.refName}`)

    // Register a global middleware
    this.server.middlewares["myPluginMiddleware"] = async (req, res, next) => {
      console.log("Plugin middleware running")
      next()
    }

    // Add a context
    this.server.contexts["myPluginData"] = { version: "1.0.0" }

    // Listen to server events
    this.server.eventBus.on("server:ready", () => {
      console.log("Server is ready!")
    })
  }
}
```

## Loading Plugins

Plugins are loaded from the `lb-plugins/` directory (or a custom path set via `LINEBRIDGE_PLUGINS_PATH` env var).

Enable plugins by setting the `LINEBRIDGE_PLUGINS` environment variable with a comma-separated list of plugin names:

```bash
LINEBRIDGE_PLUGINS=my-plugin,auth-plugin npx linebridge-boot index.ts
```

Each plugin name corresponds to a directory inside the plugins path:

```
lb-plugins/
├── my-plugin/
│   └── index.ts
├── auth-plugin/
│   └── index.ts
```

## Plugin Lifecycle

Plugins are initialized in step 14 of the [server lifecycle](/guide/core-concepts#lifecycle), after routes are registered but during the `run()` method:

1. Plugin is `require()`d from its path
2. Instantiated with `new Plugin(server)`
3. Added to `server.plugins` Map
4. `plugin.initialize()` is called (if defined)

## Use Cases

| Use Case | Implementation |
|----------|---------------|
| Database connections | Initialize connection pool in `initialize()`, expose via contexts |
| Authentication | Register auth middleware and user resolution logic |
| Monitoring | Listen to server events, expose metrics endpoints |
| Custom protocols | Modify the engine or register new route types |
| Feature flags | Load configuration and expose via contexts |
