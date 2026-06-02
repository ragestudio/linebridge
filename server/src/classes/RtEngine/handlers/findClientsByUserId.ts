import type RTEngine from "../index"
import type Client from "../classes/client"

export default async function findClientsByUserId(
	this: RTEngine,
	user_id: string,
): Promise<Client[]> {
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	if (this.server.nats) {
		return await this.server.nats.operations.findClientsByUserId(user_id)
	}

	const clients: Client[] = []

	for (const [, client] of this.clients) {
		if (client.userId === user_id) {
			clients.push(client)
		}
	}

	return clients
}
