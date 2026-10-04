import WebsocketClient from "./index"
import type { ClientParams } from "./types"

export type FactoryParams = ClientParams & {
	/** Establish a connection right after creating the client */
	autoConnect?: boolean
}

/**
 * Creates a websocket client and optionally connects it.
 * Auto connection is enabled by default.
 */
export function createWebsocketClient<
	CustomEvents extends Record<string, any> = {},
>(params: FactoryParams): WebsocketClient<CustomEvents> {
	const { autoConnect = true, ...clientParams } = params

	const client = new WebsocketClient<CustomEvents>(clientParams)

	if (autoConnect === true) {
		client.connect().catch((error) => {
			client.logger.error("Auto connect failed:", error)
		})
	}

	return client
}

export default createWebsocketClient
