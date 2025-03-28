### Example
Create a http server
```js
// index.js
import { Server } from "linebridge"

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
