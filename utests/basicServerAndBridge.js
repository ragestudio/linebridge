import { Bridge } from "../src/client"
import { Server, Controller } from "../src/server"

const Middlewares = {
    "test": (req, res, next) => {
        console.log("test middleware, it should run on every endpoint of a controller")
        return next()
    },
    "test2": (req, res, next) => {
        console.log("test2 middleware, it should run on request of a endpoint")
        return next()
    }
}

const Controllers = [
    class DisabledController extends Controller {
        static disabled = true

        get = {
            "/unreachable": (req, res) => {
                return res.send("this must not be reachable")
            }
        }

    },
    class TestController extends Controller {
        static useMiddlewares = ["test"]

        channels = {
            "epicEvent": (socket, ...args) => {
                console.log(`[SERVER WS EVENT] > ${socket.id} > `, ...args)
                return socket.res("elo")
            }
        }

        get = {
            "/test/:name": {
                fn: (req, res) => {
                    const name = req.params.name

                    return res.json({
                        message: name ? `Hello ${name}!` : "Hello World!"
                    })
                },
            },
            "/crashTest": (req, res) => {
                throw new Error("Boom!")
            },
            "/test": (req, res) => {
                return res.send("Hello World!")
            }
        }

        delete = {
            "/test": (req, res) => {
                return res.send(`Deleting ${req.body.a}`)
            }
        }
    },
]

async function _main() {
    const server = new Server({
        onWSClientConnection: (socket) => {
            const authToken = socket.handshake.auth?.token
            console.log(`AUTH TOKEN: ${authToken}`)

            if (!authToken) {
                socket.emit("unauthorized", "No auth token provided!")
                return socket.disconnect()
            }

            if (authToken !== "123") {
                socket.emit("unauthorized", "invalid auth token!")
                return socket.disconnect()
            }
        }
    }, Controllers, Middlewares)

    const clientBridge = new Bridge({
        origin: server.HTTPAddress,
        wsOrigin: server.WSAddress,
        wsMainSocketOptions: {
            auth: {
                token: "123"
            }
        },
    }, {
        onUnauthorized: (reason) => {
            console.log(reason)
        }
    })

    await server.initialize()
    await clientBridge.initialize()

    const test = await clientBridge.endpoints.get.test()
    const crashTest = await clientBridge.endpoints.get.crashtest().catch(error => {
        console.log(error)
        return "Crash test passed!"
    })
    const wsEpicEvent = await clientBridge.wsEndpoints.epicEvent("Hello", "World")

    console.log(`[get.test] > ${test}`)
    console.log(`[get.crashtest] > ${crashTest}`)
    console.log(`[ws.epicEvent] > ${wsEpicEvent}`)
}

_main().catch((error) => {
    console.error(`[MAIN_ERROR] ${error}`)
})