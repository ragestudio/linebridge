export default async function (user_id, event, data) {
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToUserId === "function"
	) {
		return await this.server.nats.operations.sendToUserId(
			user_id,
			event,
			data,
		)
	}

	// get the clients
	const clients = this.find.clientsByUserId(user_id)

	for (const client of clients) {
		await client.emit(event, data)
	}
}
