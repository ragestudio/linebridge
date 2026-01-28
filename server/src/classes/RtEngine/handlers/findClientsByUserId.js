export default async function (user_id) {
	if (this.nats) {
		return await this.nats.operations.findClientsByUserId(user_id)
	}

	// initialize array to store matching clients
	const clients = []

	// search through all connected clients
	for (const [_, client] of this.clients) {
		// check if client belongs to the requested user
		if (client.userId === user_id) {
			clients.push(client)
		}
	}

	return clients
}
