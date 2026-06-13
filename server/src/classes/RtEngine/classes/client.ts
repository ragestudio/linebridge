/**
 * Client class representing a single WebSocket connection.
 *
 * Wraps a raw uWebSockets.js socket and provides high-level methods
 * for emitting events, subscribing to topics, and sending errors/acks.
 *
 * @module RtEngine/Client
 */

import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

/**
 * Represents a connected WebSocket client within the RTEngine.
 *
 * Each client has a unique id, optional authentication data (user/session),
 * and methods to emit events and manage topic subscriptions.
 */
export class Client {
	/** The parent RTEngine instance that manages this client */
	engine: RTEngine

	/** The raw uWebSockets.js socket wrapped by this client */
	socket: RtEngineSocket | null

	/** Unique identifier for this client (copied from the socket context) */
	id: string

	/** The full context object attached to the underlying socket */
	context: RtEngineSocket["context"]

	/** User id extracted from the context (null when not authenticated) */
	userId: string | undefined

	/** Whether this client has an active session (i.e. is authenticated) */
	authenticated: boolean

	constructor(engine: RTEngine, socket: RtEngineSocket) {
		this.engine = engine
		this.socket = socket

		// Copy identity fields from the socket context
		this.id = socket.context.id
		this.context = socket.context

		// Extract the user id if present
		this.userId = socket.context.user?._id || undefined
		// A client is authenticated when a session exists
		this.authenticated = !!socket.context.session
	}

	/**
	 * Sends an event to this client over the WebSocket connection.
	 *
	 * The payload is JSON-encoded via the engine's encode method and includes
	 * the event name, optional data, optional error, and an ack flag.
	 *
	 * @param event  - Name of the event to emit
	 * @param data   - Optional payload data
	 * @param error  - Optional error to attach
	 * @param ack    - Whether this is an acknowledgment (defaults to false/undefined)
	 */
	async emit(
		event: string,
		data?: any,
		error?: any,
		ack?: boolean,
	): Promise<any> {
		if (!this.socket) return null

		return this.socket.send(
			this.engine.encode({
				event,
				data,
				error,
				ack,
			}),
		)
	}

	/**
	 * Publishes an event to a topic (pub/sub).
	 *
	 * All clients subscribed to the topic will receive the message.
	 * If `self` is true, the event is also emitted directly to this client.
	 *
	 * @param topic - The topic to publish to
	 * @param event - Event name to send
	 * @param data  - Optional payload data
	 * @param self  - Whether to also emit the event to this client (default false)
	 */
	async toTopic(
		topic: string,
		event: string,
		data?: any,
		self: boolean = false,
	): Promise<any> {
		if (!this.socket) return null

		// Build the JSON payload and publish to all topic subscribers
		const payload = this.engine.encode({ topic, event, data })
		this.socket.publish(topic, payload)

		// Optionally deliver to the sender as well
		if (self === true) {
			return this.emit(event, data)
		}
	}

	/**
	 * Sends an error event to this client.
	 *
	 * Accepts either an Error object or a string message.
	 *
	 * @param error - The error to send
	 */
	async error(error: Error | string): Promise<void> {
		// Convert Error objects to their string representation
		if (error instanceof Error) {
			error = error.toString()
		}

		this.emit("error", null, error)
	}

	/**
	 * Sends an acknowledgment for a previously received event.
	 *
	 * The ack flag is set to true so the receiver can correlate
	 * the response with the original request.
	 *
	 * @param eventKey - The event name to acknowledge
	 * @param data     - Optional result data
	 * @param error    - Optional error message
	 */
	async ack(eventKey: string, data?: any, error?: any): Promise<any> {
		if (typeof eventKey !== "string") {
			throw new TypeError("eventKey must be a string")
		}

		return this.emit(eventKey, data, error, true)
	}

	/**
	 * Subscribes this client to a pub/sub topic.
	 *
	 * After subscribing, the client will receive all messages published
	 * to the topic. A "topic:subscribed" event is emitted to confirm.
	 *
	 * @param topic - The topic name to subscribe to
	 */
	async subscribe(topic: string): Promise<any> {
		if (!this.socket) return null

		// Register the subscription on the raw socket
		this.socket.subscribe(topic)
		// Confirm the subscription to the client
		return this.emit("topic:subscribed", topic)
	}

	/**
	 * Unsubscribes this client from a pub/sub topic.
	 *
	 * A "topic:unsubscribed" event is emitted to confirm the removal.
	 *
	 * @param topic - The topic name to unsubscribe from
	 */
	async unsubscribe(topic: string): Promise<any> {
		if (!this.socket) return null

		// Remove the subscription from the raw socket
		this.socket.unsubscribe(topic)
		// Confirm the unsubscription to the client
		return this.emit("topic:unsubscribed", topic)
	}

	/**
	 * Unsubscribes this client from all currently subscribed topics.
	 *
	 * Called during disconnect to clean up all topic subscriptions.
	 */
	async unsubscribeAll(): Promise<void> {
		if (!this.socket) return

		// Iterate over all topics and unsubscribe one by one
		for (const topic of this.socket.topics) {
			await this.unsubscribe(topic)
		}
	}

	/**
	 * Placeholder for future operation dispatching.
	 *
	 * Intended to be overridden or extended by subclasses if needed.
	 *
	 * @param _type - Operation type
	 * @param _data - Optional operation data
	 */
	async operation(_type: string, _data?: any): Promise<any> {
		return null
	}
}

export default Client
