import { Bridge } from "../src/client"
import { Server, Controller } from "../src/server"


const ServerControllersA = [
    class TestController extends Controller {
        remoteEvents = {
            "remoteEventTest": (arg1, arg2) => {
                console.log("[Recived on TestControllerA]remoteEventTest", arg1, arg2)
            }
        }
    },
]

const ServerControllersB = [
    class TestController extends Controller {
        remoteEvents = {
            "remoteEventTest": (arg1, arg2) => {
                console.log("[Recived on TestControllerA]remoteEventTest", arg1, arg2)
            }
        }
    },
]

async function _main() {
    const ServerA = new Server({
        port: 3090,
        wsPort: 3092,
        silent: true,
    }, ServerControllersA)

    const ServerB = new Server({
        port: 3091,
        wsPort: 3093,
        silent: true,
        remoteLinker: [
            {
                namespace: "ServerA",
                origin: "http://localhost:3090", // this is a reference to ServerA
            },
        ],
    }, ServerControllersB)


    await ServerA.initialize()
    await ServerB.initialize()
}

_main().catch((error) => {
    console.error(`[MAIN_ERROR] ${error}`)
})