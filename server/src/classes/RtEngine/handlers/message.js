import { WebsocketRequestHandler } from "../../Handler"

export default async function (socket, payload) {
	// retrieve client instance from socket context
	const client = this.clients.get(socket.context.id)

	// ensure client exists in our registry
	if (!client) {
		return socket.send(
			this.encode({ event: "error", data: "Client not found" }),
		)
	}

	let handler = null

	try {
		// parse incoming json payload
		payload = this.decode(payload)

		// validate event field is a string
		if (typeof payload.event !== "string") {
			return client.error("Invalid event type")
		}

		// lookup event handler in registry
		handler = this.events.get(payload.event)

		if (!(handler instanceof WebsocketRequestHandler)) {
			throw new OperationError(
				500,
				"Cannot find the handler for this event",
			)
		}

		const [result, error] = await handler.execute(client, payload)

		if (payload.ack === true) {
			client.ack(payload.event, result, error?.message)
		}
	} catch (error) {
		// log unexpected errors (skip operation errors)
		if (!(error instanceof OperationError)) {
			console.debug(`[ws] 500 /${payload?.event ?? "unknown"} >`, error)
		}

		// send error acknowledgment
		if (payload?.event) {
			client.ack(payload.event, null, error.message)
		}
	}
}
