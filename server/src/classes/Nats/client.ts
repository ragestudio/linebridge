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
import serializeError from "../../utils/serializeError"
import safeJsonStringify from "../../utils/safeJsonStringify"
import { operationsTimeout } from "./handlers/dispatchOperation"
import { nats } from "../../lazyNats"

// a gateway that does not own the socket answers with this error so the
// caller can retry the operation on the broadcast subject
const CLIENT_NOT_FOUND = "client_not_found"

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
			node_id: headers.get("node_id") ?? undefined,
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

	/** the gateway node that owns the physical socket */
	get nodeId(): string | undefined {
		return this.context.node_id
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
		if (error instanceof Error) {
			error = serializeError(error)
		}

		const payload = { event, data, error, ack }
		let serialized: string

		try {
			serialized = Serializers.EventData(payload)
		} catch (err: any) {
			if (err?.message?.includes("circular")) {
				console.warn(
					`[nats-client] circular reference detected while serializing event "${event}", falling back to safe serialization`,
				)
				serialized = safeJsonStringify(payload)
			} else {
				throw err
			}
		}

		// a known node only wakes up its own gateway, the broadcast subject
		// stays as fallback for sockets without node information
		const subject = this.context.node_id
			? `downstream.${this.context.node_id}`
			: "ipc"

		await this.nats.publish(subject, Buffer.from(serialized), {
			headers: this.headers,
		})
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
	 * sends an operation bound to this socket and awaits a reply
	 *
	 * when the owning node is known the request goes to
	 * "operations.<node>", so only the gateway holding the socket answers.
	 * if that gateway no longer owns it, the request is retried on the
	 * broadcast subject which older gateways still handle.
	 */
	async operation(type: string, data?: any): Promise<any> {
		const payload = Buffer.from(Serializers.Operation({ type, data }))
		const nodeId = this.context.node_id

		if (nodeId) {
			const directed = await this.requestOperation(
				`operations.${nodeId}`,
				payload,
				this.headers,
			)

			if (directed?.ok) {
				return directed
			}

			if (directed && directed.error !== CLIENT_NOT_FOUND) {
				return await this.error(directed.error)
			}
		}

		const response = await this.requestOperation(
			"operations",
			payload,
			this.legacyHeaders(),
		)

		if (!response) {
			return null
		}

		if (!response.ok) {
			return await this.error(response.error)
		}

		return response
	}

	/** issues a request and decodes the reply, null on timeout or error */
	private async requestOperation(
		subject: string,
		payload: Buffer,
		headers: any,
	): Promise<any> {
		try {
			const response = await this.nats.request(subject, payload, {
				headers,
				timeout: operationsTimeout(),
			})

			return this.codec.decode(response.data)
		} catch (error) {
			console.error(error)
			return null
		}
	}

	/**
	 * clones the client headers and marks the request as directed, so
	 * gateways with node routing skip the broadcast copy
	 */
	private legacyHeaders(): any {
		if (!nats) {
			return this.headers
		}

		const headers = nats.headers()

		for (const key of this.headers.keys()) {
			for (const value of this.headers.values(key)) {
				headers.append(key, value)
			}
		}

		headers.set("directed", "1")

		return headers
	}
}
