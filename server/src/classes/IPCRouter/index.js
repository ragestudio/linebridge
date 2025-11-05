export default class IPCRouter {
	processes = new Map()

	register = (service) => {
		// allocate the service by id
		this.processes.set(service.id, service)

		// listen for messages
		service.instance.on("message", this.messageHandler)
	}

	unregister = (id) => {
		this.processes.delete(id)
	}

	messageHandler = (msg) => {
		if (typeof msg !== "object") {
			return false
		}

		const { event, target, payload } = msg

		if (!event || !event.startsWith("ipc:") || !target) {
			// not an IPC message, ignore
			return false
		}

		if (event.startsWith("ipc:")) {
			return this.route(target, event, payload)
		}
	}

	route = (target, event, payload) => {
		try {
			// first search service
			let targetService = this.processes.get(target)

			if (!targetService) {
				console.error(
					`[IPC:ROUTER] Service [${target.toString()}] not found`,
				)

				return false
			}

			if (!targetService.instance) {
				console.error(
					`[IPC:ROUTER] Service [${target.toString()}] not ready`,
				)

				return false
			}

			// send message to service
			targetService.instance.send({
				event: event,
				payload: payload,
			})
		} catch (e) {
			console.error(e)
		}
	}
}
