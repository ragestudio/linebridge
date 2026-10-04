import type { EventHandler } from "../types"
import type WebsocketClient from "./index"
import type { EventPayload } from "./types"

/**
 * Sends an event to the server and waits for a single response,
 * rejected on error acknowledgement or timeout.
 */
export default function rpc<R = any>(
	client: WebsocketClient<any>,
	event: string,
	data: any,
	timeout: number,
): Promise<R> {
	return new Promise((resolve, reject) => {
		if (!client.connection.isSendable()) {
			return reject(new Error("Socket not connected"))
		}

		// reference to remove the handler later
		const handlerObj: EventHandler = {
			event,
			handler: (data: any, payload: EventPayload) => {
				clearTimeout(timerId)

				if (payload.error) return reject(payload.error)
				if (payload.ack) return resolve(data as R)
			},
			once: true,
			ack: true,
		}

		// timeout safety net
		const timerId = setTimeout(() => {
			client.events.remove(event, handlerObj)
			reject(new Error(`Call timeout for event: ${event}`))
		}, timeout)

		client.events.add(event, handlerObj)
		client.connection.send(event, data, { ack: true })
	})
}
