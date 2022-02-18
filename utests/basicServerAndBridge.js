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

        on = {
            "epicEvent": (socket, arg1, arg2) => {
                socket.response("Boom!")
                socket.fail("Ido not know what to do with this epic event")
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
    })

    await clientBridge.initialize()

    const test = await clientBridge.endpoints.get.test()
    const crashTest = await clientBridge.endpoints.get.crashtest().catch(error => {
        console.log(error)
        return false
    })

    console.log(`[get.test] > ${test}`)
    console.log(`[get.crashtest] > ${crashTest}`)
}

_main().catch((error) => {
    console.error(`[MAIN_ERROR] ${error}`)
})