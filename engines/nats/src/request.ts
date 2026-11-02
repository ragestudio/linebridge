import type { Msg } from "@nats-io/transport-node"
import type { GenericRequest } from "linebridge/classes/Handler/generic"

export class NatsRequest<T = unknown> implements GenericRequest<T> {
	subject: string
	reply?: string
	headers: Record<string, string>
	data: T
	raw: Msg

	constructor(msg: Msg, data: T) {
		this.raw = msg
		this.subject = msg.subject
		this.reply = msg.reply
		this.headers = headersToObject(msg.headers)
		this.data = data
	}

	json<U = T>(): U {
		return this.data as unknown as U
	}
}

function headersToObject(headers: Msg["headers"]): Record<string, string> {
	const result: Record<string, string> = {}

	if (!headers) return result

	for (const key of headers.keys()) {
		const value = headers.get(key)

		if (typeof value === "string") {
			result[key.toLowerCase()] = value
		}
	}

	return result
}

export default NatsRequest
