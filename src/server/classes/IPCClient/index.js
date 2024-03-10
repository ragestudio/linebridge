import { EventEmitter } from "@foxify/events"

export default class IPCClient {
    constructor(self, _process) {
        this.self = self
        this.process = _process

        this.process.on("message", (msg) => {
            if (typeof msg !== "object") {
                // not an IPC message, ignore
                return false
            }

            const { event, payload } = msg

            if (!event || !event.startsWith("ipc:")) {
                return false
            }

            if (event.startsWith("ipc:exec")) {
                return this.handleExecution(payload)
            }

            if (event.startsWith("ipc:akn")) {
                return this.handleAcknowledgement(payload)
            }
        })
    }

    eventBus = new EventEmitter()

    handleExecution = async (payload) => {
        let { id, command, args, from } = payload

        let fn = this.self.ipcEvents[command]

        if (!fn) {
            this.process.send({
                event: `ipc:akn:${id}`,
                payload: {
                    target: from,
                    from: this.self.constructor.refName,

                    id: id,
                    error: `IPC: Command [${command}] not found`,
                }
            })

            return false
        }

        try {
            let result = await fn(this.self.contexts, ...args)

            this.process.send({
                event: `ipc:akn:${id}`,
                payload: {
                    target: from,
                    from: this.self.constructor.refName,

                    id: id,
                    result: result,
                }
            })
        } catch (error) {
            this.process.send({
                event: `ipc:akn:${id}`,
                payload: {
                    target: from,
                    from: this.self.constructor.refName,

                    id: id,
                    error: error.message,
                }
            })
        }
    }

    handleAcknowledgement = async (payload) => {
        let { id, result, error } = payload

        this.eventBus.emit(`ipc:akn:${id}`, {
            id: id,
            result: result,
            error: error,
        })
    }

    // call a command on a remote service, and waits to get a response from akn (async)
    call = async (to_service_id, command, ...args) => {
        const remote_call_id = Date.now()

        const response = await new Promise((resolve, reject) => {
            try {

                this.process.send({
                    event: "ipc:exec",
                    payload: {
                        target: to_service_id,
                        from: this.self.constructor.refName,

                        id: remote_call_id,
                        command,
                        args,
                    }
                })

                this.eventBus.once(`ipc:akn:${remote_call_id}`, resolve)
            } catch (error) {
                console.error(error)

                reject(error)
            }
        }).catch((error) => {
            return {
                error: error
            }
        })

        if (response.error) {
            throw new OperationError(500, response.error)
        }

        return response.result
    }

    // call a command on a remote service, but return it immediately
    invoke = async (to_service_id, command, ...args) => {
        const remote_call_id = Date.now()

        try {
            this.process.send({
                event: "ipc:exec",
                payload: {
                    target: to_service_id,
                    from: this.self.constructor.refName,

                    id: remote_call_id,
                    command,
                    args,
                }
            })

            return {
                id: remote_call_id
            }
        } catch (error) {
            console.error(error)

            return {
                error: error
            }
        }
    }
}