import type WebsocketClient from "./index"
import handlers from "./handlers"

/**
 * Builds the map of built-in event handlers bound to the client.
 */
export default function createBaseHandlers(
	client: WebsocketClient<any>,
): Record<string, Function> {
	return {
		connected: handlers.connected.bind(client),
		reconnected: handlers.reconnected.bind(client),
		error: handlers.error.bind(client),
		ping: handlers.ping.bind(client),
		"topic:subscribed": handlers.topicSubscribed.bind(client),
		"topic:unsubscribed": handlers.topicUnsubscribed.bind(client),
	}
}
