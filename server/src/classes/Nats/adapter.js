import { connect, JSONCodec, createInbox, consumerOpts } from "nats"

import * as Serializers from "./serializers"

import handleUpstream from "./handlers/handleUpstream"
import dispatchOperation from "./handlers/dispatchOperation"

import findClientsByUserId from "./operations/findClientsByUserId"
import sendToTopic from "./operations/sendToTopic"
import sendToClientID from "./operations/sendToClientID"
import sendToUserId from "./operations/sendToUserId"

export default class NatsAdapter {
	constructor(server, params = {}) {
		this.server = server
		this.params = params

		this.refName = this.server.constructor.refName
		this.subscriptions = new Map()
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

		this.ipcSub = await this.jetstream.subscribe(
			`ipc.${this.refName}`,
			opts,
		)

		const eventLoop = async () => {
			for await (const message of this.ipcSub) {
				this.handleUpstream(message)
			}
		}

		eventLoop()
	}

	async subscribeToGlobalChannel(channel, handler) {
		const subscription = this.nats.subscribe(`global.${channel}`)

		this.subscriptions.set(channel, subscription)

		const eventLoop = async () => {
			for await (const message of subscription) {
				try {
					handler(this.codec.decode(message.data), message)
				} catch (error) {
					console.error(
						`Error handling global message: ${error.message}`,
					)
				}
			}
		}

		eventLoop()
	}

	async unsubscribeFromGlobalChannel(channel) {
		const subscription = this.subscriptions.get(channel)

		if (!subscription) {
			return
		}

		await subscription.drain()

		this.subscriptions.delete(channel)
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
