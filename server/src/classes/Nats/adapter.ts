/**
 * @file nats adapter that connects the server to the NATS cluster
 *
 * manages the lifetime of the NATS connection, JetStream subscriptions,
 * and inter-service communication. when the LB_GATEWAY_SOCKET env var is
 * set, the server initializes this adapter and becomes part of a
 * distributed cluster where clients can be connected to any instance.
 */

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

/**
 * manages the NATS connection and JetStream messaging for the server
 *
 * connects to a NATS cluster, sets up JetStream durable subscriptions
 * for inter-process communication (ipc), and exposes operations that
 * other services can call. also supports subscribing to global pubsub
 * channels for cross-service event broadcasting.
 */
export default class NatsAdapter {
	/** the linebridge server instance */
	server: Server
	/** connection parameters for the NATS server */
	params: { address?: string; port?: number }
	/** unique reference name used as the durable consumer name */
	refName: string
	/** tracks active global channel subscriptions for cleanup */
	subscriptions: Map<string, any>

	// exposed so operations can serialize their own payloads if needed
	serializers = Serializers
	/** json codec for encoding/decoding message payloads */
	codec = JSONCodec()

	/** underlying NATS connection instance */
	nats: any = null
	/** JetStream client for durable messaging */
	jetstream: any = null
	/** JetStream subscription for ipc messages addressed to this refName */
	ipcSub: any = null

	constructor(
		server: Server,
		params: { address?: string; port?: number } = {},
	) {
		this.server = server
		this.params = params

		// use the server class name as the consumer/queue group name
		this.refName = (this.server.constructor as any).refName
		this.subscriptions = new Map()
	}

	/**
	 * connects to NATS and starts listening for ipc messages
	 *
	 * creates a JetStream durable consumer so messages are not lost
	 * if this instance is temporarily down. the consumer name includes
	 * the refName so each service type gets its own durable queue.
	 * starts an async event loop that processes incoming messages
	 * through handleUpstream
	 */
	initialize = async (): Promise<void> => {
		this.nats = await connect({
			servers: `nats://${this.params.address ?? "localhost"}:${this.params.port ?? 4222}`,
		})

		console.log(`Connected to NATS server [${this.nats.getServer()}]`)

		this.jetstream = this.nats.jetstream()

		const opts = consumerOpts()

		// durable name ensures messages survive restarts
		opts.durable(`${this.refName}-processor`)
		// queue group distributes messages across instances of the same service
		opts.queue(`${this.refName}-worker`)
		// explicit ack so we can ack after successful processing
		opts.ackExplicit()
		// ephemeral inbox for receiving messages
		opts.deliverTo(createInbox())

		// subscribe to the ipc stream for this service type
		this.ipcSub = await this.jetstream.subscribe(
			`ipc.${this.refName}`,
			opts,
		)

		// start the message processing loop
		const eventLoop = async () => {
			for await (const message of this.ipcSub) {
				this.handleUpstream(message)
			}
		}

		eventLoop()
	}

	/**
	 * subscribes to a global pubsub channel for cross-service events
	 *
	 * messages published to "global.{channel}" by any service will be
	 * delivered to the provided handler. useful for broadcasting
	 * notifications or state changes across the whole cluster
	 */
	async subscribeToGlobalChannel(
		channel: string,
		handler: (data: any, message: any) => void,
	): Promise<void> {
		const subscription = this.nats.subscribe(`global.${channel}`)

		this.subscriptions.set(channel, subscription)

		// process incoming messages in a dedicated async loop
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

	/**
	 * removes a global channel subscription and drains pending messages
	 *
	 * drains gracefully so in-flight messages are not lost before the
	 * subscription is fully removed from the tracking map
	 */
	async unsubscribeFromGlobalChannel(channel: string): Promise<void> {
		const subscription = this.subscriptions.get(channel)

		if (!subscription) {
			return
		}

		await subscription.drain()

		this.subscriptions.delete(channel)
	}

	// bind handlers to this adapter instance so they have access to
	// nats, server, and the operations map
	handleUpstream = handleUpstream.bind(this)
	dispatchOperation = dispatchOperation.bind(this)

	/**
	 * map of cluster-wide operations callable by other services
	 *
	 * each entry is a method that the operations request handler
	 * dispatches to based on the "type" field of the incoming message
	 */
	operations = {
		findClientsByUserId: findClientsByUserId.bind(this),
		sendToTopic: sendToTopic.bind(this),
		sendToClientID: sendToClientID.bind(this),
		sendToUserId: sendToUserId.bind(this),
	}
}
