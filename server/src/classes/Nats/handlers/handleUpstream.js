import NatsClient from "../client"

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

		client = new NatsClient({
			engine: this.engine,
			nats: this.nats,
			headers: message.headers,
			codec: this.codec,
		})

		if (event === "socket:connected") {
			if (typeof this.engine.onConnection === "function") {
				return await this.engine.onConnection(client)
			}

			return null
		}

		if (event === "socket:disconnected") {
			if (typeof this.engine.onDisconnect === "function") {
				return await this.engine.onDisconnect(client)
			}

			return null
		}

		handler = this.engine.events.get(event)

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
