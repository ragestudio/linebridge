export default async function (client_id, event, data) {
	if (
		this.nats &&
		typeof this.nats.operations?.sendToClientID === "function"
	) {
		return await this.nats.operations.sendToClientID(client_id, event, data)
	}

	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	// get the clients
	const client = this.clients.get(client_id)

	if (!client) {
		throw new Error(`Client ${client_id} not found`)
	}

	// send the message to the client
	await client.emit(event, data)
}
