/**
 * @file nats adapter that connects the server to the NATS cluster
 *
 * manages the lifetime of the NATS connection, JetStream subscriptions,
 * and inter-service communication. when the LB_GATEWAY_SOCKET env var is
 * set, the server initializes this adapter and becomes part of a
 * distributed cluster where clients can be connected to any instance.
 */

import * as nats from "@nats-io/transport-node"
import { jetstream, jetstreamManager } from "@nats-io/jetstream"
import * as Serializers from "./serializers"

import JSONCodec from "./codecs/json"

import handleUpstream from "./handlers/handleUpstream"
import dispatchOperation from "./handlers/dispatchOperation"

import findClientsByUserId from "./operations/findClientsByUserId"
import sendToTopic from "./operations/sendToTopic"
import sendToClientID from "./operations/sendToClientID"
import sendToUserId from "./operations/sendToUserId"

import type { JetStreamClient, JetStreamManager } from "@nats-io/jetstream"
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
	codec = new JSONCodec()

	/** underlying NATS connection instance */
	connection: nats.NatsConnection | null = null
	/** JetStream client for durable messaging */
	jetstream: JetStreamClient | null = null
	/** JetStream consumer messages iterator for ipc messages */
	ipcMessages: any = null

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
		this.connection = await nats.connect({
			servers: `nats://${this.params.address ?? "localhost"}:${this.params.port ?? 4222}`,
		})

		console.log(`Connected to NATS server [${this.connection.getServer()}]`)

		this.jetstream = jetstream(this.connection)

		const jsm: JetStreamManager = await jetstreamManager(this.connection)

		const ipcSubject = `ipc.${this.refName}`
		let streamName: string

		// find or create the stream that captures ipc subjects
		try {
			streamName = await jsm.streams.find(ipcSubject)
		} catch {
			streamName = "IPC"

			await jsm.streams.add({
				name: streamName,
				subjects: ["ipc.>"],
			})

			console.log(`Created JetStream stream [${streamName}]`)
		}

		// ensure the durable consumer exists for this service type
		const consumerName = `${this.refName}-processor`

		try {
			await jsm.consumers.add(streamName, {
				durable_name: consumerName,
				filter_subject: ipcSubject,
				ack_policy: "explicit",
			})
		} catch (error: any) {
			// consumer may already exist, which is expected after the first run
			if (error.api_error?.err_code !== 400) {
				console.error(
					`Error adding JetStream consumer [${consumerName}]: ${error.message}`,
				)
			}
		}

		// retrieve the consumer and start the message iterator
		const consumer = await this.jetstream.consumers.get(
			streamName,
			consumerName,
		)

		// max_messages: 1 ensures load balancing across multiple instances
		this.ipcMessages = await consumer.consume({ max_messages: 1 })

		// start the message processing loop
		const eventLoop = async () => {
			for await (const message of this.ipcMessages) {
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
		if (!this.connection) {
			return
		}

		const subscription = this.connection.subscribe(`global.${channel}`)

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
