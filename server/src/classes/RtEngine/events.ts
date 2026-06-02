import type { WebsocketHandlerFunction } from "../../classes/Handler/websocket"
import type Client from "./classes/client"

const events: Record<string, WebsocketHandlerFunction> = {
	ping: async (client: any, _data?: any) => {
		client.emit("pong")
	},
}

export default events
