import type { Codec, Msg } from "@nats-io/transport-node"
import type { GenericResponse } from "linebridge/classes/Handler/generic"

export class NatsResponse implements GenericResponse {
	completed: boolean
	// true once send or error was called, even for fire-and-forget messages
	handled: boolean = false

	constructor(
		private readonly msg: Msg,
		private readonly codec: Codec<unknown>,
	) {
		// messages without a reply are fire-and-forget
		this.completed = !msg.reply
	}

	send(data: unknown): void {
		if (this.handled) return

		this.handled = true

		if (this.completed) return

		this.completed = true
		this.msg.respond(this.codec.encode({ data: data ?? null }))
	}

	error(error: unknown, code = 500): void {
		if (this.handled) return

		this.handled = true

		if (this.completed) return

		this.completed = true

		const message = error instanceof Error ? error.message : String(error)

		this.msg.respond(this.codec.encode({ error: message, code }))
	}
}

export default NatsResponse
