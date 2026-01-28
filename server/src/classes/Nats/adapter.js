import { connect, JSONCodec, createInbox, consumerOpts } from "nats"

import * as Serializers from "./serializers"

import handleUpstream from "./handlers/handleUpstream"
import dispatchOperation from "./handlers/dispatchOperation"

import findClientsByUserId from "./operations/findClientsByUserId"
import sendToTopic from "./operations/sendToTopic"
import sendToClientID from "./operations/sendToClientID"
import sendToUserId from "./operations/sendToUserId"

export default class NatsAdapter {
	constructor(engine, params = {}) {
		this.engine = engine
		this.params = params

		this.refName = this.engine.server.constructor.refName
	}

	serializers = Serializers
	codec = JSONCodec()

	initialize = async () => {
		this.nats = await connect({
			servers: `nats://${this.params.address ?? "localhost"}:${this.params.port ?? 4222}`,
		})

		console.log(`Connected to NATS server [${this.nats.getServer()}]`)

		this.jetstream = this.nats.jetstream()

		const opts = consumerOpts()

		opts.durable(`${this.refName}-processor`)
		opts.queue(`${this.refName}-worker`)
		opts.ackExplicit()
		opts.deliverTo(createInbox())

		this.subscription = await this.jetstream.subscribe(
			`ipc.${this.refName}`,
			opts,
		)

		const eventLoop = async () => {
			for await (const message of this.subscription) {
				this.handleUpstream(message)
			}
		}

		eventLoop()
	}

	handleUpstream = handleUpstream.bind(this)
	dispatchOperation = dispatchOperation.bind(this)

	operations = {
		findClientsByUserId: findClientsByUserId.bind(this),
		sendToTopic: sendToTopic.bind(this),
		sendToClientID: sendToClientID.bind(this),
		sendToUserId: sendToUserId.bind(this),
	}
}
