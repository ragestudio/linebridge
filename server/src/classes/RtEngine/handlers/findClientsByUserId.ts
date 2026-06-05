/**
 * Finder handler: locates all connected clients belonging to a given user.
 *
 * When NATS is enabled (gateway mode), the search is delegated to NATS
 * so it can find the user's clients across all server instances.
 * Otherwise, it iterates the local Clients collection.
 *
 * @module RtEngine/handlers/findClientsByUserId
 */

import type RTEngine from "../index"
import type Client from "../classes/client"

/**
 * Returns all Client instances associated with the given user id.
 *
 * In gateway mode (NATS available), delegates to NATS for a cluster-wide search.
 * In local mode, filters the local Clients collection by userId.
 *
 * @param this    - The RTEngine instance (bound via .bind(this))
 * @param user_id - The user id to search for
 * @returns Array of Client instances belonging to the user
 */
export default async function findClientsByUserId(
	this: RTEngine,
	user_id: string,
): Promise<Client[]> {
	// Guard: the engine must be attached before searching
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	// Gateway mode: delegate to NATS for cluster-wide search
	if (this.server.nats) {
		return await this.server.nats.operations.findClientsByUserId(user_id)
	}

	// Local mode: iterate the Clients map and filter by userId
	const clients: Client[] = []

	for (const [, client] of this.clients) {
		if (client.userId === user_id) {
			clients.push(client)
		}
	}

	return clients
}
