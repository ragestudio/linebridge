import type { WsEventHandlerFn } from "../../types"
import type Client from "./classes/client"

const events: Record<string, WsEventHandlerFn> = {
	ping: async (client: any, _data?: any) => {
		client.emit("pong")
	},
}

export default events
