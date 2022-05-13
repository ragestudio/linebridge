import { Server, Controller } from "../src/server"

const TestControllers = [
    class AController extends Controller {
        get = {
            "/test": (req, res) => {
                return res.send("Hello World!")
            }
        }
    }
]

async function _main() {
    const server = new Server({
        httpEngine: "express"
    }, TestControllers)

    await server.initialize()
}

_main().catch((error) => {
    console.error(`[MAIN_ERROR] ${error}`)
})