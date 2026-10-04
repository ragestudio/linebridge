import type WebsocketClient from "./index"

/**
 * Watchdog that closes the connection when the server
 * does not send a ping within the expected interval.
 */
export default class HeartbeatController {
	constructor(client: WebsocketClient<any>) {
		this.client = client
	}

	client: WebsocketClient<any>

	#timer: ReturnType<typeof setTimeout> | null = null

	/** Starts or restarts the heartbeat watchdog */
	start(interval: number, gracePeriod: number): void | null {
		const client = this.client

		if (!client.state.connected || client.abortController.signal.aborted) {
			return null
		}

		this.stop()

		this.#timer = setTimeout(() => {
			if (client.abortController.signal.aborted) return null

			client.logger.warn(
				"Connection timeout, server did not send ping in time",
			)

			client.connection.close()
		}, interval + gracePeriod)
	}

	/** Stops the heartbeat watchdog */
	stop(): void {
		if (this.#timer) clearTimeout(this.#timer)
		this.#timer = null
	}
}
