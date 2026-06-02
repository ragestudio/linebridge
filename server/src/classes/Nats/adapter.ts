const {
	connect,
	JSONCodec,
	createInbox,
	consumerOpts,
} = require("@nats-io/transport-node")

import * as Serializers from "./serializers"

import handleUpstream from "./handlers/handleUpstream"
import dispatchOperation from "./handlers/dispatchOperation"

import findClientsByUserId from "./operations/findClientsByUserId"
import sendToTopic from "./operations/sendToTopic"
import sendToClientID from "./operations/sendToClientID"
import sendToUserId from "./operations/sendToUserId"

import type Server from "../../server"

export default class NatsAdapter {
	server: Server
	params: { address?: string; port?: number }
	refName: string
	subscriptions: Map<string, any>

	serializers = Serializers
	codec = JSONCodec()

	nats: any = null
	jetstream: any = null
	ipcSub: any = null

	constructor(
		server: Server,
		params: { address?: string; port?: number } = {},
	) {
		this.server = server
		this.params = params

		this.refName = (this.server.constructor as any).refName
		this.subscriptions = new Map()
	}

	initialize = async (): Promise<void> => {
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

	async subscribeToGlobalChannel(
		channel: string,
		handler: (data: any, message: any) => void,
	): Promise<void> {
		const subscription = this.nats.subscribe(`global.${channel}`)

		this.subscriptions.set(channel, subscription)

		const eventLoop = async () => {
			for await (const message of subscription) {
				try {
					handler(this.codec.decode(message.data), message)
				} catch (error: any) {
					console.error(
						`Error handling global message: ${error.message}`,
					)
				}
			}
		}

		eventLoop()
	}

	async unsubscribeFromGlobalChannel(channel: string): Promise<void> {
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
