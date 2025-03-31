import { EventEmitter } from "@foxify/events"

class WorkerEngineRouter {
    routes = []

    get = (path, ...execs) => {

    }

    post = (path, ...execs) => {

    }

    delete = (path, ...execs) => {

    }

    put = (path, ...execs) => {

    }

    patch = (path, ...execs) => {

    }

    head = (path, ...execs) => {

    }

    options = (path, ...execs) => {

    }

    any = (path, ...execs) => {

    }

    use = (path, ...execs) => {

    }
}

class WorkerEngine {
    static ipcPrefix = "rail:"

    selfId = process.env.lb_service.id

    router = new WorkerEngineRouter()

    eventBus = new EventEmitter()

    perExecTail = []

    initialize = async () => {
        console.error(`[WorkerEngine] Worker engine its not implemented yet...`)

        process.on("message", this.handleIPCMessage)
    }

    listen = async () => {
        console.log(`Sending Rail Register`)

        process.send({
            type: "rail:register",
            data: {
                id: process.env.lb_service.id,
                pid: process.pid,
                routes: this.router.routes,
            }
        })
    }

    handleIPCMessage = async (msg) => {
        if (typeof msg !== "object") {
            // ignore, its not for us
            return false
        }

        if (!msg.event || !msg.event.startsWith(WorkerEngine.ipcPrefix)) {
            return false
        }

        const { event, payload } = msg

        switch (event) {
            case "rail:request": {
                const { req } = payload

                break
            }
            case "rail:response": {

            }
        }
    }

    use = (fn) => {
        if (fn instanceof WorkerEngineRouter) {
            this.router = fn
            return
        }

        if (fn instanceof Function) {
            this.perExecTail.push(fn)
            return
        }
    }
}

export default class Engine {
    constructor(params) {
        this.params = params
    }

    app = new WorkerEngine()

    router = new WorkerEngineRouter()

    init = async () => {
        await this.app.initialize()
    }

    listen = async () => {
        await this.app.listen()
    }
}