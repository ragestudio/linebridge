import OperationError from "../../OperationError"
import Handler, { HandlerKind } from "../../Handler"
import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

export default async function message(
	this: RTEngine,
	socket: RtEngineSocket,
	rawPayload: any,
) {
	const client = this.clients.get(socket.context.id)

	if (!client) {
		return socket.send(
			this.encode({ event: "error", data: "Client not found" }),
		)
	}

	let payload: any = null

	try {
		payload = this.decode(rawPayload)

		if (typeof payload.event !== "string") {
			return client.error("Invalid event type")
		}

		const handler = this.events.get(payload.event)

		if (
			!handler ||
			!(handler instanceof Handler) ||
			handler.kind !== HandlerKind.ws
		) {
			throw new OperationError(
				500,
				"Cannot find the handler for this event",
			)
		}

		const [result, error] = await handler.execute(client, payload)

		if (payload.ack === true) {
			client.ack(payload.event, result, error?.message)
		}
	} catch (error: any) {
		if (!(error instanceof OperationError)) {
			console.debug(`[ws] 500 /${payload?.event ?? "unknown"} >`, error)
		}

		if (payload?.event) {
			client.ack(payload.event, null, error.message)
		}
	}
}
