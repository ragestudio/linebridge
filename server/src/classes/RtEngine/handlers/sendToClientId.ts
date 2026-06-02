import type RTEngine from "../index"

export default async function sendToClientId(
	this: RTEngine,
	client_id: string,
	event: string,
	data?: any,
) {
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToClientID === "function"
	) {
		return await this.server.nats.operations.sendToClientID(
			client_id,
			event,
			data,
		)
	}

	const client = this.clients.get(client_id)

	if (!client) {
		throw new Error(`Client ${client_id} not found`)
	}

	await client.emit(event, data)
}
