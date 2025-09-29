export default async function (socket) {
	// retrieve client instance before cleanup
	const client = this.clients.get(socket.context.id)

	// execute custom disconnect callback if provided
	try {
		if (typeof this.onDisconnect === "function") {
			await this.onDisconnect(socket, client)
		}
	} catch (error) {
		console.error("Error handling disconnect >", error)
	}

	// cleanup client subscriptions to prevent memory leaks
	try {
		if (client) {
			await client.unsubscribeAll()
		}
	} catch (error) {
		console.error("Error unsubscribing client topics >", error)
	}

	// remove client from active connections registry
	this.clients.delete(socket.context.id)
}
