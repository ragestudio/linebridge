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
- worker | IPC Worker for sharding.

## Features
- Multiproposal
- Modular and extensible
- 🚀 Fast and scalable
- 🔐 Secure by default
- Supports WebSockets
- 📦 Supports multiple protocols
- Transcompiler included on bootloader

## Getting Started
### Installation
```bash
npm install linebridge
```
> Note: Use of Yarn can cause some issues to install the package.

### Example
Create a http server
```js
// index.js
import { Server } from "./linebridge/src"

class MyAPI extends Server {
    // set a id for the server
    static refName = "my-api"
    // define a file based router
    static routesPath = `${__dirname}/routes`
    // define custom listen port
    static listenPort = 3000

    // set manual routes
    routes = {
        // basic route
        "/hi": {
            method: "get",
            fn: async (req, res) => {
                return {
                    message: "Hello world"
                }
            }
        },
        // use custom middleware
        "/middleware-custom": {
            method: "get",
            middlewares: [
                "custom-middleware"
            ],
            fn: async (req, res) => {
                return {
                    message: "The middleware is working!"
                }
            }
        },
        // get from context
        "/db": {
            method: "get",
            useContexts: [
                "db"
            ],
            fn: async (req, res, ctx) => {
                console.log(ctx)
                return ctx.db.data
            }
        },
        // use parameters
        "/sum/:value1/:value2": {
            method: "get",
            fn: async (req, res) => {
                return {
                    result: parseInt(req.params.value1) + parseInt(req.params.value2)
                }
            }
        }
    }

    // define default middlewares to use on every request
    useMiddlewares = [
        async (req, res) => {
            console.log("Im executed every request")
        }
    ]

    // you can also define custom middlewares to use on endpoints
    middlewares = {
        "custom-middleware": async (req, res) => {
            console.log("Im a custom middleware")
        }
    }

    // define custom contexts to use on endpoints
    contexts = {
        db: {
            data: [
                {
                    id: 1,
                    name: "John Doe"
                },
                {
                    id: 2,
                    name: "Jane Doe"
                }
            ]
        }
    }

    async onInitialize() {
        console.log("Server initialized")
    }

    async onClose() {
        console.log("Server closed")
    }
}

Boot(MyAPI)
```
Run the server
```bash
linebridge-boot index.js
```

## Documentation
> On the way
<!-- For more information, please visit the [documentation](https://docs.linebridge.com). -->
