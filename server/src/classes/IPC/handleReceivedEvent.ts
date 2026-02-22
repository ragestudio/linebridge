import type { Msg } from "nats"
import type IPC from "./index"

type handleReceivedEvent = (this: IPC, message: Msg) => Promise<void>

async function handleReceivedEvent(this: IPC, message: Msg) {
	let event: string
	let result: any

	try {
		if (!message.headers) {
			throw new Error("Missing headers")
		}

		event = message.headers.get("event")

		if (!event) {
			throw new Error("Missing event")
		}

		if (!this.server.ipcEvents) {
			throw new Error("IPC events not initialized")
		}

		if (!this.server.ipcEvents[event]) {
			throw new Error(`Event [${event}] not found`)
		}

		if (typeof this.server.ipcEvents[event] !== "function") {
			throw new Error(`Event [${event}] is not a function`)
		}

		result = await this.server.ipcEvents[event](
			this.server.contexts ?? {},
			this.codec.decode(message.data),
		)

		message.respond(
			this.codec.encode({
				data: result,
			}),
		)
	} catch (error: any) {
		message.respond(this.codec.encode({ error: error.message }))
	}
}

export default handleReceivedEvent
