import type WebsocketClient from "./index"

/**
 * Watchdog that verifies the connection is alive. The server sends an
 * application ping every few seconds; when the browser throttles timers
 * (background tabs, debugger pauses) the timer can fire late, so before
 * closing the socket the controller probes the server and gives the event
 * loop a grace window to deliver any queued message.
 *
 * It also sends a small application ping, so stateful proxies and NATs see
 * traffic in both directions on an otherwise idle connection.
 */
export default class HeartbeatController {
	constructor(client: WebsocketClient<any>) {
		this.client = client

		if (typeof document !== "undefined") {
			document.addEventListener(
				"visibilitychange",
				this.#onVisibilityChange,
			)
		}
	}

	client: WebsocketClient<any>

	#timer: ReturnType<typeof setTimeout> | null = null
	#keepalive: ReturnType<typeof setInterval> | null = null
	#keepaliveInterval = 0
	#interval = 0
	#gracePeriod = 0

	/** Starts or restarts the heartbeat watchdog */
	start(interval: number, gracePeriod: number): void | null {
		const client = this.client

		if (!client.state.connected || client.abortController.signal.aborted) {
			return null
		}

		this.#interval = interval
		this.#gracePeriod = gracePeriod

		this.#resetWatchdog()
		this.#ensureKeepalive(interval)
	}

	/** Stops the watchdog and the keepalive timer */
	stop(): void {
		if (this.#timer) clearTimeout(this.#timer)
		if (this.#keepalive) clearInterval(this.#keepalive)

		this.#timer = null
		this.#keepalive = null
	}

	/** Stops timers and removes the page listeners */
	destroy(): void {
		this.stop()

		if (typeof document !== "undefined") {
			document.removeEventListener(
				"visibilitychange",
				this.#onVisibilityChange,
			)
		}
	}

	#resetWatchdog(): void {
		if (this.#timer) clearTimeout(this.#timer)

		this.#timer = setTimeout(
			() => this.#check(),
			this.#interval + this.#gracePeriod,
		)
	}

	#check(): void {
		const client = this.client

		if (!client.state.connected || client.abortController.signal.aborted) {
			return
		}

		// ask the server for a pong instead of trusting a possibly throttled timer
		client.connection.send("ping")

		this.#timer = setTimeout(() => this.#finishCheck(), this.#gracePeriod)
	}

	#finishCheck(): void {
		const client = this.client

		if (!client.state.connected || client.abortController.signal.aborted) {
			return
		}

		const idle = performance.now() - (client.state.lastPing ?? 0)

		if (idle < this.#interval + this.#gracePeriod) {
			this.#resetWatchdog()
			return
		}

		client.logger.warn(
			"Connection timeout, server did not send ping in time",
		)

		client.connection.close()
	}

	#ensureKeepalive(interval: number): void {
		if (this.#keepalive && this.#keepaliveInterval === interval) {
			return
		}

		if (this.#keepalive) {
			clearInterval(this.#keepalive)
		}

		this.#keepaliveInterval = interval

		this.#keepalive = setInterval(() => {
			const client = this.client

			if (
				!client.state.connected ||
				client.abortController.signal.aborted
			) {
				return
			}

			client.connection.send("ping")
		}, interval)
	}

	#onVisibilityChange = (): void => {
		if (typeof document === "undefined") return
		if (document.visibilityState !== "visible") return
		if (!this.client.state.connected) return
		if (this.#interval <= 0) return

		// timers may be overdue after the page was frozen, start over
		this.#resetWatchdog()
		this.#ensureKeepalive(this.#interval)
	}
}
