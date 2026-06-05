/**
 * Built-in event handlers for the RTEngine subsystem.
 *
 * These events are always registered and available to every WebSocket client.
 * User-defined events from the config are merged on top of these.
 *
 * @module RtEngine/events
 */

import type { WebsocketHandlerFunction } from "../../classes/Handler/websocket"
import type Client from "./classes/client"

/**
 * Default built-in events registered on every RTEngine instance.
 *
 * Each handler receives the Client instance and optional payload data.
 */
const events: Record<string, WebsocketHandlerFunction> = {
	/**
	 * Responds to a ping with a pong event.
	 * Used for keep-alive and latency measurements.
	 */
	ping: async (client: any, _data?: any) => {
		client.emit("pong")
	},
}

export default events
