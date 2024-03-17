export default class IPCRouter {
    processes = []

    register = (service) => {
        service.instance.on("message", (msg) => {
            if (typeof msg !== "object") {
                // not an IPC message, ignore
                return false
            }

            const { event, payload } = msg

            if (!event || !event.startsWith("ipc:")) {
                // not an IPC message, ignore
                return false
            }

            const { target } = payload

            if (!target) {
                return false
            }

            if (event.startsWith("ipc:")) {
                return this.route(event, payload)
            }
        })

        this.processes.push(service)
    }

    unregister = (service) => {
        this.processes = this.processes.filter((_process) => _process.id !== service.id)
    }

    route = (event, payload) => {
        const { target, from } = payload

        // first search service
        let targetService = this.processes.find((_process) => _process.id === target)

        if (!targetService) {
            // TODO: respond with error
            console.error(`[IPC:ROUTER] Service [${destinationId}] not found`)

            return false
        }

        //console.log(`[IPC:ROUTER] Routing event [${event}] to service [${target}] from [${from}]`)

        targetService.instance.send({
            event: event,
            payload: payload
        })
    }
}