import { headers } from "nats"
import NatsClient from "./client"

export default (client, adapter) => {
	if (!client.socket_id) {
		throw new Error("Socket ID is required")
	}

	const clientHeaders = headers()

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
		engine: adapter.engine,
		codec: adapter.codec,
		headers: clientHeaders,
	})
}
