import { decode, encode } from "./codec"
import type WebsocketClient from "./index"

/**
 * Manages the socket lifecycle: connection, cleanup, sending data
 * and handling the underlying socket events.
 */
export default class ConnectionController {
	constructor(client: WebsocketClient<any>) {
		this.client = client
	}

	client: WebsocketClient<any>

	/**
	 * Establishes a connection to the WebSocket server.
	 * Automatically disconnects any existing connection first.
	 */
	async connect(): Promise<void> {
		const client = this.client

		if (client.abortController.signal.aborted) {
			client.abortController = new AbortController()
		}

		if (client.socket) {
			this.cleanup()
		}

		let url = `${client.params.url}`
		let token = client.params.token

		if (typeof client.params.token === "function") {
			try {
				token = await client.params.token()
			} catch (err) {
				client.logger.error("Token generation error:", err)
				return
			}
		}

		if (token) {
			url += `?token=${token}`
		}

		if (client.params.worker === true) {
			// client.socket = new Worker(new URL("worker.js", import.meta.url))
			// ...
		} else {
			client.socket = new WebSocket(url)

			client.socket.onopen = (e: Event) => this.handleOpen(e)
			client.socket.onclose = (e: CloseEvent) => this.handleClose(e)
			client.socket.onerror = (e: Event) => this.handleError(e)
			client.socket.onmessage = (e: MessageEvent) => this.handleMessage(e)
		}

		return new Promise((resolve) => {
			client.once("connected", resolve)
		})
	}

	/** Sends an event to the WebSocket server */
	send(event: string, data?: any, { ack }: { ack?: boolean } = {}): void {
		const client = this.client

		if (!client.socket) {
			client.logger.warn(
				`Cannot emit event "${event}" - socket is not setted`,
			)
			return
		}

		if (
			client.params.worker !== true &&
			client.socket.readyState !== WebSocket.OPEN
		) {
			client.logger.warn(
				`Cannot emit event "${event}" - socket is not open`,
			)
			return
		}

		if (client.params.worker === true && !client.state.connected) {
			client.logger.warn(
				`Cannot emit event "${event}" - socket is not connected`,
			)
			return
		}

		const payload = encode({ event, data, ...(ack ? { ack: true } : {}) })

		if (client.params.worker === true) {
			// client.socket.postMessage({ type: "send", payload })
		} else {
			client.socket.send(payload)
		}
	}

	/** Returns whether the socket can currently send data */
	isSendable(): boolean {
		const client = this.client

		if (!client.socket) return false

		if (
			client.params.worker !== true &&
			client.socket.readyState !== WebSocket.OPEN
		) {
			return false
		}

		if (client.params.worker === true && !client.state.connected)
			return false

		return true
	}

	/** Closes the active socket connection */
	close(): void {
		const client = this.client

		if (!client.socket) return

		if (client.params.worker === true) {
			// client.socket.postMessage({ type: "close" })
		} else {
			client.socket.close()
		}
	}

	/** Removes socket listeners and closes the connection */
	cleanup(): void {
		const client = this.client

		if (!client.socket) return

		if (client.params.worker === true) {
			// client.socket.postMessage({ type: "close" })
			// client.socket.terminate()
		} else {
			client.socket.onopen = null
			client.socket.onclose = null
			client.socket.onerror = null
			client.socket.onmessage = null
			client.socket.close()
		}

		client.socket = null
	}

	/** Handles WebSocket open event */
	handleOpen(e: Event): void {
		const client = this.client

		client.state.connected = true
		client.state.connectionRetryCount = 0

		if (client.state.reconnecting === true) {
			client.logger.log(
				`Connection reconnected at retry [${client.state.connectionRetryCount}]`,
			)
			client.dispatchToHandlers("reconnected")
		}

		client.state.reconnecting = false
		client.dispatchToHandlers("open")

		client.state.lastPing = performance.now()

		if (client.params.heartbeat === true) {
			client.heartbeat()
		}
	}

	/** Handles WebSocket close event */
	handleClose(e: CloseEvent): void {
		const client = this.client

		client.state.connected = false

		client.heartbeatController.stop()

		client.dispatchToHandlers("close")

		if (
			client.params.autoReconnect === true &&
			!client.abortController.signal.aborted
		) {
			client.tryReconnect()
		}
	}

	/** Handles WebSocket error event */
	handleError(error: Event): void {
		this.client.dispatchToHandlers("error", error)
	}

	/** Handles WebSocket message event */
	handleMessage(event: MessageEvent): void {
		const client = this.client

		try {
			const payload = decode(event.data)

			if (typeof payload.event !== "string") return

			if (payload.error) {
				const syntheticError = new Error(payload.error.message)
				syntheticError.stack = payload.error.stack
				payload.error = syntheticError
			}

			client.dispatchToHandlers("message", payload.data, payload)
			client.dispatchToHandlers(payload.event, payload.data, payload)
		} catch (error) {
			client.logger.error("Error handling message:", error)
		}
	}
}
