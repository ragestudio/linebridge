import SyntheticClient from "../client"

export default async function (message) {
	let event = null
	let client = null
	let handler = null

	try {
		message.ack()

		event = message.headers.get("event")

		if (!event) {
			return null
		}

		client = new SyntheticClient({
			engine: this.server.engine,
			nats: this.nats,
			codec: this.codec,
			headers: message.headers, // the client data is in the headers
		})

		if (event === "socket:connected") {
			if (typeof this.server.engine.ws.onConnection === "function") {
				return await this.server.engine.ws.onConnection(client)
			}

			return null
		}

		if (event === "socket:disconnected") {
			if (typeof this.server.engine.ws.onDisconnect === "function") {
				return await this.server.engine.ws.onDisconnect(client)
			}

			return null
		}

		handler = this.server.engine.ws.events.get(event)

		if (!handler) {
			await client.ack(event, null, `No handler for event [${event}]`)

			return null
		}

		const [result, error] = await handler.execute(
			client,
			this.codec.decode(message.data),
		)

		await client.ack(event, result, error?.message)
	} catch (error) {
		if (client && event) {
			await client.ack(event, null, error.message).catch(console.error)
		}

		console.error(`An error occured while handling NATS upstream`, error)
	}
}
