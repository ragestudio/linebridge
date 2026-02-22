import { JSONCodec } from "nats"
import type { NatsConnection } from "nats"

import handleReceivedEvent from "./handleReceivedEvent"
import invoke from "./invoke"

class IPC {
	constructor(server: any, nats: NatsConnection) {
		if (!nats) {
			throw new Error("NATS connection is not available")
		}

		if (!server) {
			throw new Error("Server is not available")
		}

		if (!server.params.refName) {
			throw new Error("Server reference name is not available")
		}

		this.server = server
		this.nats = nats
		const refName = this.server.params.refName

		const subscription = this.nats.subscribe(`ipc_internal.${refName}`, {
			queue: `${refName}-internal_ipc-worker`,
		})

		const eventLoop = async () => {
			for await (const message of subscription) {
				this.handleReceivedEvent(message)
			}
		}

		eventLoop()
	}

	server: any
	nats: NatsConnection
	codec = JSONCodec()

	get isAvailable() {
		if (!this.nats) {
			return false
		}

		return this.nats
	}

	handleReceivedEvent = handleReceivedEvent.bind(this)
	invoke = invoke.bind(this)
}

export default IPC
