import NatsClient from "../client"

export default async function (message) {
	message.ack()

	const event = message.headers.get("event")
	let client = null
	let handler = null

	// console.debug(`Upstream received`, {
	// 	event,
	// 	socket_id: message.headers.get("socket_id"),
	// })

	if (!event) {
		return null
	}

	try {
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
			await client.emit(
				`ack_${event}`,
				null,
				`No handler for event ${event}`,
			)

			return null
		}

		const [result, error] = await handler.execute(
			client,
			this.codec.decode(message.data),
		)

		await client.emit(`ack_${event}`, result, error?.message)
	} catch (error) {
		console.error(`An error occured while handling NATS upstream`, error)

		if (client) {
			await client
				.emit(`${event}:ack`, null, error.message)
				.catch(console.error)
		}
	}
}
