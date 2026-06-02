import type RTEngine from "../index"

export default async function sendToUserId(
	this: RTEngine,
	user_id: string,
	event: string,
	data?: any,
) {
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

	const clients = await this.find.clientsByUserId(user_id)

	for (const client of clients) {
		await client.emit(event, data)
	}
}
