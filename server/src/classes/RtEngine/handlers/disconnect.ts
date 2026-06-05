/**
 * Disconnect handler for the RTEngine subsystem.
 *
 * Called when a WebSocket connection is closed. Runs the user-provided
 * onDisconnect hook, unsubscribes the client from all topics, and removes
 * the client from the Clients collection.
 *
 * @module RtEngine/handlers/disconnect
 */

import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

/**
 * Handles a WebSocket disconnection.
 *
 * Steps:
 * 1. Looks up the Client instance from the engine's collection
 * 2. Calls the user-provided onDisconnect hook (if set), catching errors
 * 3. Unsubscribes the client from all topics, catching errors
 * 4. Removes the client from the Clients collection
 *
 * @param this   - The RTEngine instance (bound via .bind(this))
 * @param socket - The raw uWebSockets.js socket that closed
 */
export default async function disconnect(
	this: RTEngine,
	socket: RtEngineSocket,
) {
	// Look up the client by its socket context id
	const client = this.clients.get(socket.context.id)

	// Run the user-provided disconnect hook
	try {
		if (typeof this.onDisconnect === "function") {
			await this.onDisconnect(socket, client)
		}
	} catch (error) {
		console.error("Error handling disconnect >", error)
	}

	// Clean up all topic subscriptions for this client
	try {
		if (client) {
			await client.unsubscribeAll()
		}
	} catch (error) {
		console.error("Error unsubscribing client topics >", error)
	}

	// Remove the client from the active collection
	this.clients.delete(socket.context.id)
}
