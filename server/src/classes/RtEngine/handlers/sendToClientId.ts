/**
 * Sender handler: sends an event to a specific client by its id.
 *
 * When NATS is enabled (gateway mode), the send is delegated to NATS
 * so the client can be reached even if connected to a different server.
 * Otherwise, it looks up the client locally and emits directly.
 *
 * @module RtEngine/handlers/sendToClientId
 */

import type RTEngine from "../index"

/**
 * Sends an event to the client with the given id.
 *
 * In gateway mode, the operation is forwarded to NATS for cluster-wide routing.
 * In local mode, the client is looked up from the engine's Clients collection
 * and the event is emitted directly via the Client.emit() method.
 *
 * Throws an error if the engine is not initialized or the client is not found.
 *
 * @param this      - The RTEngine instance (bound via .bind(this))
 * @param client_id - The unique id of the target client
 * @param event     - The event name to send
 * @param data      - Optional payload data
 */
export default async function sendToClientId(
	this: RTEngine,
	client_id: string,
	event: string,
	data?: any,
) {
	// Guard: the engine must be attached before sending
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	// Gateway mode: delegate to NATS for cluster-wide routing
	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToClientID === "function"
	) {
		return await this.server.nats.operations.sendToClientID(
			client_id,
			event,
			data,
		)
	}

	// Local mode: look up the client by id and emit directly
	const client = this.clients.get(client_id)

	if (!client) {
		throw new Error(`Client ${client_id} not found`)
	}

	await client.emit(event, data)
}
