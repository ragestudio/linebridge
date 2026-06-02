const { headers } = require("@nats-io/transport-node")
import NatsClient from "./client"
import type NatsAdapter from "./adapter"

interface ClientInput {
	socket_id: string
	token?: string
	session?: {
		user_id: string
		username: string
	}
	user?: Record<string, any>
}

export default (client: ClientInput, adapter: NatsAdapter): NatsClient => {
	if (!client.socket_id) {
		throw new Error("Socket ID is required")
	}

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
		clientHeaders.append("user", JSON.stringify(client.user))
	}

	return new NatsClient({
		nats: adapter.nats,
		engine: adapter.server.engine,
		codec: adapter.codec,
		headers: clientHeaders,
	})
}
