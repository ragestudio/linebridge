import type WebsocketClient from "./index"

/**
 * Handles the reconnection policy and scheduling of new attempts.
 */
export default class ReconnectController {
	constructor(client: WebsocketClient<any>) {
		this.client = client
	}

	client: WebsocketClient<any>

	#timer: ReturnType<typeof setTimeout> | null = null

	/** Stops any pending reconnection attempt */
	stop(): void {
		if (this.#timer) clearTimeout(this.#timer)
		this.#timer = null
	}

	/** Attempts to reconnect to the WebSocket server */
	tryReconnect(reconnectTimeout: number): void | null {
		const client = this.client

		if (client.abortController.signal.aborted) return null

		if (
			client.state.reconnecting &&
			client.params.worker !== true &&
			client.socket?.readyState === WebSocket.CONNECTING
		) {
			return null
		}

		if (
			typeof client.params.maxConnectRetries !== "undefined" &&
			client.params.maxConnectRetries !== Infinity &&
			client.state.connectionRetryCount >= client.params.maxConnectRetries
		) {
			client.logger.error(
				`Reconnection failed: Maximum retries reached [${client.params.maxConnectRetries}]\nClosing socket permanently...`,
			)
			client.dispatchToHandlers("reconnection_failed")
			return null
		}

		client.state.connectionRetryCount =
			client.state.connectionRetryCount + 1
		client.state.reconnecting = true

		client.logger.log(
			`Connection timeout, retrying connection in ${reconnectTimeout}ms [${client.state.connectionRetryCount}/${client.params.maxConnectRetries}]`,
		)

		client.dispatchToHandlers("reconnecting")
		client.connection.cleanup()

		this.#timer = setTimeout(() => {
			client
				.connect()
				.catch((err) => client.logger.error("Reconnect failed", err))
		}, reconnectTimeout)
	}
}
