import { Bridge } from "../src/client"
import Server from "../src/server"
import { ComplexController } from "../src/classes"

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
    class TestController extends ComplexController {
        static refName = "TestController"
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
    },
]

async function _main() {
    const server = new Server(undefined, Controllers, Middlewares)
    const clientBridge = new Bridge({
        origin: server.HTTPAddress,
        wsOrigin: server.WSAddress,
    })

    await server.initialize()
    await clientBridge.initialize()

    const test = await clientBridge.endpoints.get.test()
    const crashTest = await clientBridge.endpoints.get.crashtest().catch(error => {
        console.log(error)
        return false
    })
    const wsEpicEvent = await clientBridge.wsEndpoints.epicEvent("Hello", "World")

    console.log(`[get.test] > ${test}`)
    console.log(`[get.crashtest] > ${crashTest}`)
    console.log(`[ws.epicEvent] > ${wsEpicEvent}`)
}

_main().catch((error) => {
    console.error(`[MAIN_ERROR] ${error}`)
})