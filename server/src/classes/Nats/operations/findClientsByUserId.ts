/**
 * @file cluster operation: find all connected clients for a given user id
 *
 * dispatches a "findClientsByUserId" request across the cluster and
 * synthesizes NatsClient proxies from the returned socket data so
 * callers can interact with the user's sessions on remote gateways
 */

import synthesizeClient from "../synthesizeClient"
import type NatsAdapter from "../adapter"
import type NatsClient from "../client"

/**
 * finds all connected client sockets belonging to a given user
 *
 * sends a "findClientsByUserId" operation to the cluster. the service
 * that owns the web socket layer responds with an array of raw client
 * records, which are then rebuilt into NatsClient proxy instances
 * using synthesizeClient
 *
 * @param user_id - the authenticated user id to look up
 * @returns an array of NatsClient proxies for the user's sessions
 * @throws {Error} if the response is not an array
 */
export default async function findClientsByUserId(
	this: NatsAdapter,
	user_id: string,
): Promise<NatsClient[]> {
	// ask the cluster to find all sockets for this user
	const sockets = await this.dispatchOperation("findClientsByUserId", {
		user_id,
	})

	if (!Array.isArray(sockets)) {
		throw new Error("Invalid response from operation. Expected an array.")
	}

	// convert raw socket data into NatsClient proxy objects
	return sockets.map((client: any) => {
		return synthesizeClient(client, this)
	})
}
