import type NatsAdapter from "../adapter"
import NatsClient from "../client"

export default async function handleUpstream(this: NatsAdapter, message: any) {
	let event: string | null = null
	let client: NatsClient | null = null

	try {
		message.ack()

		event = message.headers?.get("event") ?? null

		if (!event) {
			return null
		}

		client = new NatsClient({
			engine: this.server.engine,
			nats: this.nats,
			codec: this.codec,
			headers: message.headers,
		})

		if (event === "socket:connected") {
			if (
				this.server.engine?.ws &&
				typeof (this.server.engine.ws as any).onConnection ===
					"function"
			) {
				return await (this.server.engine.ws as any).onConnection(client)
			}

			return null
		}

		if (event === "socket:disconnected") {
			if (
				this.server.engine?.ws &&
				typeof (this.server.engine.ws as any).onDisconnect ===
					"function"
			) {
				return await (this.server.engine.ws as any).onDisconnect(client)
			}

			return null
		}

		const handler = (this.server.engine?.ws as any)?.events?.get(event)

		if (!handler) {
			await client.ack(event, null, `No handler for event [${event}]`)
			return null
		}

		const [result, error] = await handler.execute(
			client,
			this.codec.decode(message.data),
		)

		await client.ack(event, result, error?.message)
	} catch (error: any) {
		if (client && event) {
			await client.ack(event, null, error.message).catch(console.error)
		}

		console.error("An error occured while handling NATS upstream", error)
	}
}
