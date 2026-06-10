/**
 * @file processes incoming ipc messages from the NATS gateway
 *
 * when a socket connects, disconnects, or emits an event on the
 * gateway, the gateway publishes a message to the ipc stream.
 * this handler rebuilds the NatsClient context from headers and
 * delegates to the local engine's event system.
 */

import type NatsAdapter from "../adapter"
import NatsClient from "../client"

/**
 * handles an incoming NATS message from the gateway
 *
 * extracts the event type from message headers, constructs a NatsClient
 * proxy from those same headers, and dispatches to the appropriate
 * engine handler:
 *
 * - "socket:connected" calls engine.ws.onConnection
 * - "socket:disconnected" calls engine.ws.onDisconnect
 * - any other event looks up a registered handler in engine.ws.events
 *
 * on success the handler result is acked back to the gateway so it can
 * relay the response to the physical socket. on failure an error ack
 * is sent and the error is logged
 *
 * @param message - the JetStream message containing headers and data
 */
export default async function handleUpstream(this: NatsAdapter, message: any) {
	let event: string | null = null
	let client: NatsClient | null = null

	try {
		// acknowledge receipt so the message is not redelivered
		message.ack()

		// extract the event name from the message headers
		event = message.headers?.get("event") ?? null

		if (!event) {
			return null
		}

		// rebuild a NatsClient proxy from the message headers
		client = new NatsClient({
			engine: this.server.engine,
			nats: this.nats,
			codec: this.codec,
			headers: message.headers,
		})

		// a new socket has connected on the gateway
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

		// an existing socket has disconnected on the gateway
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

		// for custom events, look up the registered handler in the ws engine
		const handler = (this.server.engine?.ws as any)?.events?.get(event)

		if (!handler) {
			await client.ack(event, null, `No handler for event [${event}]`)
			return null
		}

		// decode the message body and execute the handler
		const [result, error] = await handler.execute(
			client,
			this.codec.decode(message.data),
		)

		// ack back with the result (or error) so the gateway can relay it
		await client.ack(event, result, error?.message)
	} catch (error: any) {
		// if we have enough context, try to ack the error to the client
		if (client && event) {
			await client.ack(event, null, error.message).catch(console.error)
		}

		console.error("An error occured while handling NATS upstream", error)
	}
}
