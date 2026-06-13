/**
 * @file nats client proxy representing a remote websocket connection
 *
 * when a client is connected to a remote gateway instance, the local
 * server creates a NatsClient wrapper. all emits and operations are
 * routed through NATS subjects so they reach the physical socket on
 * the gateway that owns it.
 */

import * as Serializers from "./serializers"

import type RTEClient from "../RtEngine/classes/client"
import type { NatsClientContext } from "./types"

/**
 * proxy object for a client connected to a different gateway instance
 *
 * wraps the NATS connection, headers, and codec so that the server's
 * engine can interact with the client as if it were local. publishes
 * events to the "ipc" subject and sends operation requests to the
 * "operations" subject, both with the client's headers attached so
 * the remote gateway can route them to the correct socket.
 */
export default class NatsClient implements RTEClient {
	/** the server engine that owns this client proxy */
	engine: any
	/** the nats connection used for publishing and requesting */
	nats: any
	/** nats message headers identifying the remote socket */
	headers: any
	/** codec used to decode operation response payloads */
	codec: any
	/** deserialized client context extracted from headers */
	context: NatsClientContext

	socket!: null

	constructor({
		engine,
		nats,
		headers,
		codec,
	}: {
		engine: any
		nats: any
		headers: any
		codec: any
	}) {
		this.engine = engine
		this.nats = nats
		this.headers = headers
		this.codec = codec

		// extract identity and session data from nats message headers
		this.context = {
			id: headers.get("socket_id"),
			socket_id: headers.get("socket_id"),
			token: headers.get("token"),
			user_id: headers.get("user_id"),
			userId: headers.get("user_id"),
			username: headers.get("username"),
		}

		// user document is stored as a json string in headers
		if (headers.get("user")) {
			this.context.user = JSON.parse(headers.get("user")!)
		}
	}

	/** shortcut to the client's socket id */
	get id(): string {
		return this.context.socket_id
	}

	/** the authenticated user id, if any */
	get userId(): string | undefined {
		return this.context.userId
	}

	/**
	 * returns the user object for this client
	 *
	 * if a full user document was passed via headers it is returned
	 * as-is, otherwise a minimal object is built from available fields
	 */
	get user(): Record<string, any> {
		if (this.context.user) {
			return this.context.user
		}

		return {
			_id: this.context.userId,
			username: this.context.username,
			avatar: this.context.avatar,
		}
	}

	/** whether the client has both a token and a user_id */
	get authenticated(): boolean {
		return !!this.context.token && !!this.context.userId
	}

	/**
	 * publishes an event to the remote client via the "ipc" subject
	 *
	 * the client's headers are attached so NATS can route the message
	 * to the correct gateway instance, which then forwards it to the
	 * physical websocket connection identified by socket_id
	 */
	async emit(
		event: string,
		data?: any,
		error?: any,
		ack?: boolean,
	): Promise<void> {
		await this.nats.publish(
			"ipc",
			Buffer.from(Serializers.EventData({ event, data, error, ack })),
			{ headers: this.headers },
		)
	}

	/**
	 * convenience method to send an error event to the client
	 *
	 * emits with ack set to false since errors are fire-and-forget
	 */
	async error(error: any): Promise<void> {
		await this.emit("error", null, error, false)
	}

	/**
	 * sends an acknowledgment event to the client
	 *
	 * sets ack to true so the receiving side knows this is an explicit
	 * response to a previous request, not a spontaneous push event
	 */
	async ack(event: string, data?: any, error?: any): Promise<void> {
		if (typeof event !== "string") {
			throw new TypeError("event must be a string")
		}

		await this.emit(event, data, error, true)
	}

	/**
	 * subscribes the remote client to a pubsub topic
	 *
	 * sends a "subscribeToTopic" operation to the operations subject,
	 * then emits a local confirmation event so listeners on this
	 * instance are notified
	 */
	async subscribe(topic: string): Promise<any> {
		const response = await this.operation("subscribeToTopic", { topic })

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		return await this.emit("topic:subscribed", topic)
	}

	/**
	 * unsubscribes the remote client from a pubsub topic
	 *
	 * sends an "unsubscribeToTopic" operation and emits a local
	 * confirmation event on success
	 */
	async unsubscribe(topic: string): Promise<any> {
		const response = await this.operation("unsubscribeToTopic", { topic })

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		return await this.emit("topic:unsubscribed", topic)
	}

	/**
	 * unsubscribes the remote client from all pubsub topics
	 */
	async unsubscribeAll(): Promise<void> {
		for (const topic of this.engine.topics) {
			await this.unsubscribe(topic)
		}
	}

	/**
	 * sends an event to all clients subscribed to the given topic
	 *
	 * dispatches a "sendToTopic" operation across the cluster. if self
	 * is true, the sender also receives the event locally
	 */
	async toTopic(
		topic: string,
		event: string,
		data?: any,
		self: boolean = false,
	): Promise<any> {
		const response = await this.operation("sendToTopic", {
			topic,
			event,
			data,
		})

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		if (self === true) {
			await this.emit(event, data)
		}
	}

	/**
	 * sends a request to the "operations" subject and awaits a reply
	 *
	 * this is the core method used by subscribe, unsubscribe, and
	 * toTopic. it serializes the operation type and data, sends a
	 * NATS request with a 50-second timeout, decodes the response,
	 * and returns the result. on error it emits an error event to
	 * the client and returns null
	 */
	async operation(type: string, data?: any): Promise<any> {
		try {
			const response = await this.nats.request(
				"operations",
				Buffer.from(Serializers.Operation({ type, data })),
				{ headers: this.headers, timeout: 50000 },
			)

			const decoded = this.codec.decode(response.data)

			if (!decoded.ok) {
				return await this.error(decoded.error)
			}

			return decoded
		} catch (error) {
			console.error(error)
			return null
		}
	}
}
