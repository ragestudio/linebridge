/**
 * Sender handler: publishes an event to a pub/sub topic.
 *
 * When NATS is enabled (gateway mode), the publish is delegated to NATS
 * so it reaches subscribers across all server instances.
 * Otherwise, the message is published locally via uWebSockets.js.
 *
 * @module RtEngine/handlers/sendToTopic
 */

import type RTEngine from "../index"

/**
 * Publishes an event to all clients subscribed to the given topic.
 *
 * The payload is JSON-encoded and includes the topic, event name, and data.
 *
 * In gateway mode, the operation is forwarded to NATS for cluster-wide delivery.
 * In local mode, uWebSockets.js publish() is used directly.
 *
 * @param this  - The RTEngine instance (bound via .bind(this))
 * @param topic - The topic to publish to
 * @param event - The event name to send
 * @param data  - Optional payload data
 */
export default async function sendToTopic(
	this: RTEngine,
	topic: string,
	event: string,
	data?: any,
) {
	// Guard: the engine must be attached before publishing
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	// Gateway mode: delegate to NATS for cluster-wide distribution
	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToTopic === "function"
	) {
		return await this.server.nats.operations.sendToTopic(topic, event, data)
	}

	// Local mode: publish directly via uWebSockets.js
	return this.engine.app.publish(topic, this.encode({ topic, event, data }))
}
