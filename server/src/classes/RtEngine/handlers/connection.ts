import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"
import Client from "../classes/client"

export default async function connection(
	this: RTEngine,
	socket: RtEngineSocket,
) {
	if (this.onConnection) {
		await this.onConnection(socket)
	}

	socket.on("message", (payload: any) => this.handleMessage(socket, payload))
	socket.on("close", () => this.handleDisconnect(socket))

	const client = new Client(this, socket)

	await client.emit("connected", {
		id: client.id,
		authenticated: client.authenticated,
	})

	this.clients.set(socket.context.id, client)
}
