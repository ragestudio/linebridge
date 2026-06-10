/**
 * Message handler for the RTEngine subsystem.
 *
 * Called when a WebSocket client sends a message. Decodes the JSON payload,
 * looks up the matching event handler, executes it, and optionally sends
 * an acknowledgment back to the client.
 *
 * @module RtEngine/handlers/message
 */

import OperationError from "../../OperationError"
import Handler, { HandlerKind } from "../../Handler"
import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

/**
 * Handles an incoming WebSocket message.
 *
 * Steps:
 * 1. Looks up the Client for the sending socket
 * 2. Decodes the JSON payload
 * 3. Validates that the payload has a string "event" field
 * 4. Looks up the registered handler for the event
 * 5. Executes the handler, receiving [result, error]
 * 6. If the payload requested an ack, sends the result/error back
 *
 * Errors during processing are caught and sent as an ack if the event is known.
 *
 * @param this       - The RTEngine instance (bound via .bind(this))
 * @param socket     - The raw uWebSockets.js socket that sent the message
 * @param rawPayload - The raw message payload (expected to be a JSON string)
 */
export default async function message(
	this: RTEngine,
	socket: RtEngineSocket,
	rawPayload: any,
) {
	// Find the client associated with this socket
	const client = this.clients.get(socket.context.id)

	// If no client is found, send an error and bail out
	if (!client) {
		return socket.send(
			this.encode({ event: "error", data: "Client not found" }),
		)
	}

	let payload: any = null

	try {
		// Decode the raw JSON payload
		payload = this.decode(rawPayload)

		// The payload must contain an event name
		if (typeof payload.event !== "string") {
			return client.error("Invalid event type")
		}

		// Look up the handler registered for this event
		const handler = this.events.get(payload.event)

		// Reject if no handler or the handler is not a WebSocket handler
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

		//@ts-ignore
		// Execute the handler: returns [result, error] tuple
		const [result, error] = await handler.execute(client, payload)

		// If the client requested an acknowledgment, send it back
		if (payload.ack === true) {
			client.ack(payload.event, result, error?.message)
		}
	} catch (error: any) {
		// Log non-OperationError errors for debugging
		if (!(error instanceof OperationError)) {
			console.debug(`[ws] 500 /${payload?.event ?? "unknown"} >`, error)
		}

		// Send the error as an ack if we know the event name
		if (payload?.event) {
			client.ack(payload.event, null, error.message)
		}
	}
}
