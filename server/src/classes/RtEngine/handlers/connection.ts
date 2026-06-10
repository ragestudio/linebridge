/**
 * Connection handler for the RTEngine subsystem.
 *
 * Called by uWebSockets.js when a new WebSocket connection is established.
 * Sets up message and close listeners, creates a Client wrapper, emits the
 * "connected" event, and registers the client in the Clients collection.
 *
 * @module RtEngine/handlers/connection
 */

import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"
import Client from "../classes/client"

/**
 * Handles a new WebSocket connection.
 *
 * Steps:
 * 1. Calls the user-provided onConnection hook (if set)
 * 2. Registers a message listener that delegates to handleMessage
 * 3. Registers a close listener that delegates to handleDisconnect
 * 4. Creates a Client wrapper for the raw socket
 * 5. Emits a "connected" event with the client id and auth status
 * 6. Adds the client to the engine's Clients collection
 *
 * @param this   - The RTEngine instance (bound via .bind(this))
 * @param socket - The raw uWebSockets.js socket
 */
export default async function connection(
	this: RTEngine,
	socket: RtEngineSocket,
) {
	// Call the user-provided hook before setting up the connection
	if (this.onConnection) {
		await this.onConnection(socket)
	}

	// Listen for incoming messages and forward to the message handler
	socket.on("message", (payload: any) => this.handleMessage(socket, payload))

	// Listen for socket close and forward to the disconnect handler
	socket.on("close", () => this.handleDisconnect(socket))

	// Wrap the raw socket in a Client instance
	const client = new Client(this, socket)

	// Notify the client that the connection is established
	await client.emit("connected", {
		id: client.id,
		authenticated: client.authenticated,
	})

	// Register the client in the collection
	this.clients.set(socket.context.id, client)
}
