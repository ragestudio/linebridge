import Client from "../classes/client"

export default async function (socket) {
	// run custom connection callback if provided
	if (this.onConnection) {
		await this.onConnection(socket)
	}

	// setup socket event listeners
	socket.on("message", (payload) => this.handleMessage(socket, payload))
	socket.on("close", () => this.handleDisconnect(socket))

	// create new client instance for this connection
	const client = new Client(this, socket)

	// notify client of successful connection
	await client.emit("connected", {
		id: client.id,
		authenticated: client.authenticated,
	})

	// register client in our clients map
	this.clients.set(socket.context.id, client)
}
