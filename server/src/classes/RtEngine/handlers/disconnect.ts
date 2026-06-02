import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

export default async function disconnect(
	this: RTEngine,
	socket: RtEngineSocket,
) {
	const client = this.clients.get(socket.context.id)

	try {
		if (typeof this.onDisconnect === "function") {
			await this.onDisconnect(socket, client)
		}
	} catch (error) {
		console.error("Error handling disconnect >", error)
	}

	try {
		if (client) {
			await client.unsubscribeAll()
		}
	} catch (error) {
		console.error("Error unsubscribing client topics >", error)
	}

	this.clients.delete(socket.context.id)
}
