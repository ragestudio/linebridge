import type { NatsConnection, Subscription } from "@nats-io/transport-node"

import handleReceivedEvent from "./handleReceivedEvent"
import invoke from "./invoke"

import JSONCodec from "../Nats/codecs/json"

export class IPC {
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

		this.subscription = subscription

		const eventLoop = async () => {
			for await (const message of subscription) {
				this.handleReceivedEvent(message)
			}
		}

		eventLoop()
	}

	server: any
	nats: NatsConnection
	subscription: Subscription | null = null
	codec = new JSONCodec()

	get isAvailable() {
		if (!this.nats) {
			return false
		}

		return true
	}

	handleReceivedEvent = handleReceivedEvent.bind(this) as OmitThisParameter<
		typeof handleReceivedEvent
	>
	invoke = invoke.bind(this) as OmitThisParameter<typeof invoke>

	async close(): Promise<void> {
		this.subscription?.unsubscribe()
		this.subscription = null
	}
}

export default IPC
