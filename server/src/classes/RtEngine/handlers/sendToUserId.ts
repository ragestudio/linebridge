/**
 * Sender handler: sends an event to all clients belonging to a given user.
 *
 * When NATS is enabled (gateway mode), the send is delegated to NATS
 * so it reaches the user's clients across all server instances.
 * Otherwise, it finds the user's clients locally via findClientsByUserId
 * and emits the event to each one.
 *
 * @module RtEngine/handlers/sendToUserId
 */

import type RTEngine from "../index"

/**
 * Sends an event to every connected client associated with the given user id.
 *
 * In gateway mode, the operation is forwarded to NATS for cluster-wide delivery.
 * In local mode, the user's clients are found via the find.clientsByUserId
 * helper and the event is emitted to each one individually.
 *
 * @param this    - The RTEngine instance (bound via .bind(this))
 * @param user_id - The user id whose clients should receive the event
 * @param event   - The event name to send
 * @param data    - Optional payload data
 */
export default async function sendToUserId(
	this: RTEngine,
	user_id: string,
	event: string,
	data?: any,
) {
	// Guard: the engine must be attached before sending
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	// Gateway mode: delegate to NATS for cluster-wide delivery
	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToUserId === "function"
	) {
		return await this.server.nats.operations.sendToUserId(
			user_id,
			event,
			data,
		)
	}

	// Local mode: find the user's clients and emit to each one
	const clients = await this.find.clientsByUserId(user_id)

	for (const client of clients) {
		await client.emit(event, data)
	}
}
