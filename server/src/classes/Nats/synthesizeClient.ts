/**
 * @file factory function that builds a NatsClient from raw socket data
 *
 * used by operations like findClientsByUserId to reconstruct proxy
 * objects from the bare context fields returned by a remote service
 */

import { headers } from "@nats-io/transport-node"
import NatsClient from "./client"
import type NatsAdapter from "./adapter"

/**
 * input shape expected when synthesizing a client from external data
 *
 * mirrors the fields that the gateway server serializes into NATS
 * headers when a socket connects or when listing connected clients
 */
interface ClientInput {
	/** the websocket connection id */
	socket_id: string
	/** authentication token */
	token?: string
	/** session data with user_id and username */
	session?: {
		user_id: string
		username: string
	}
	/** full user document */
	user?: Record<string, any>
}

/**
 * constructs a NatsClient proxy from raw client input data
 *
 * takes the fields that a gateway exposes about a connected socket
 * and builds the NATS headers and NatsClient instance so local code
 * can interact with that remote client as if it were directly connected
 *
 * @param client - raw socket/client data from a remote service
 * @param adapter - the nats adapter to borrow nats, engine, and codec from
 * @returns a fully constructed NatsClient proxy
 * @throws {Error} if socket_id is missing
 */
export default (client: ClientInput, adapter: NatsAdapter): NatsClient => {
	if (!client.socket_id) {
		throw new Error("Socket ID is required")
	}

	// build nats headers that will identify the remote socket
	const clientHeaders: any = headers()

	clientHeaders.append("socket_id", client.socket_id)

	if (client.token) {
		clientHeaders.append("token", client.token)
	}

	if (client.session) {
		clientHeaders.append("user_id", client.session.user_id)
		clientHeaders.append("username", client.session.username)
	}

	if (client.user) {
		// user objects are serialized as json in a single header value
		clientHeaders.append("user", JSON.stringify(client.user))
	}

	// create the proxy using the adapter's shared resources
	return new NatsClient({
		nats: adapter.connection,
		engine: adapter.server.engine,
		codec: adapter.codec,
		headers: clientHeaders,
	})
}
