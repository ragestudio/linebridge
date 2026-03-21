import { version } from "../../package.json"
import TopicsController from "./topics"
import handlers from "./handlers"

import type {
	RTE_ClientParams,
	RTE_ClientState,
	RTE_EventHandler,
} from "./index.d"

/**
 * WebSocket client for real-time communication with a backend service.
 * Provides connection management, automatic reconnection, heartbeat monitoring,
 * event handling, and topic-based subscriptions.
 */
export class RTEngineClient {
	/**
	 * Creates a new RTEngineClient instance.
	 *
	 * @param {*} [params={}] - Configuration parameters for the client.
	 * @param {string} [params.refName="default"] - Reference name for this client instance.
	 * @param {boolean} [params.autoReconnect=true] - Whether to automatically attempt reconnection.
	 * @param {number} [params.maxConnectRetries=Infinity] - Maximum number of reconnection attempts.
	 * @param {boolean} [params.heartbeat=true] - Whether to use heartbeat to monitor connection health.
	 * @param {string} [params.url] - WebSocket server URL to connect to.
	 * @param {string} [params.token] - Authentication token to include in the connection.
	 * @param {boolean} [params.worker] - Whether to use a webworker for the WebSocket connection.
	 */
	constructor(params: any = {}) {
		this.params = {
			refName: "default",
			heartbeat: true,
			autoReconnect: true,
			maxConnectRetries: Infinity,
			...params,
		}

		// @ts-ignore
		globalThis.__rte_client_version__ = version
	}

	params: RTE_ClientParams
	abortController = new AbortController()

	/** @type {string} Client library version */
	static version: string = version
	/** @type {number} Timeout for heartbeat checks in milliseconds */
	static heartbeatTimeout: number = 10000
	/** @type {number} Delay between reconnection attempts in milliseconds */
	static reconnectTimeout: number = 5000
	/** @type {number} Default timeout for RPC calls in milliseconds */
	static callTimeout: number = 10000

	/**
	 * Gets the current library version.
	 *
	 * @returns {string} Current version string.
	 */
	get version(): string {
		return RTEngineClient.version
	}

	/**
	 * Client state object.
	 *
	 * @type {Object}
	 * @property {string|null} id - Client ID assigned by the server.
	 * @property {boolean} connected - Whether the client is currently connected.
	 * @property {boolean} authenticated - Whether the client is authenticated.
	 * @property {number|null} lastPing - Timestamp of the last ping sent.
	 * @property {number|null} lastPong - Timestamp of the last pong received.
	 * @property {number|null} latency - Current connection latency in milliseconds.
	 * @property {boolean} reconnecting - Whether the client is attempting to reconnect.
	 * @property {number} connectionRetryCount - Number of reconnection attempts made.
	 */
	state: RTE_ClientState = {
		id: null,
		connected: false,
		authenticated: false,
		lastPing: null,
		lastPong: null,
		latency: null,
		reconnecting: false,
		connectionRetryCount: 0,
	}

	/** @type {WebSocket|Worker|null} Active WebSocket connection */
	socket: any = null

	/**
	 * Collection of event handlers.
	 * @type {Map<string, Set<Object>>}
	 */
	handlers: Map<string, Set<Object>> = new Map()

	/** @type {TopicsController} Controller for topic-based subscriptions */
	topics: TopicsController = new TopicsController(this)

	/** @type {number|null} Internal timer reference for heartbeat */
	#heartbeatTimer: ReturnType<typeof setTimeout> | null = null

	/** @type {number|null} Internal timer reference for reconnection */
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null

	/**
	 * Establishes a connection to the WebSocket server.
	 * Automatically disconnects any existing connection first.
	 *
	 * @returns {Promise<void>} Promise that resolves when the connection is established.
	 */
	async connect(): Promise<void> {
		if (this.abortController.signal.aborted) {
			this.abortController = new AbortController()
		}

		if (this.socket) {
			this.#cleanupSocket()
		}

		let url = `${this.params.url}`
		let token = this.params.token

		if (typeof this.params.token === "function") {
			try {
				token = await this.params.token()
			} catch (err) {
				console.error(
					`[rt/${this.params.refName}] Token generation error:`,
					err,
				)
				return
			}
		}

		if (token) {
			url += `?token=${token}`
		}

		if (this.params.worker === true) {
			this.socket = new Worker(new URL("worker.js", import.meta.url))
			this.socket.postMessage({
				type: "connect",
				payload: {
					url: url,
					heartbeat: this.params.heartbeat,
					heartbeatTimeout: RTEngineClient.heartbeatTimeout,
				},
			})

			this.socket.onmessage = (e: MessageEvent) => {
				const { type, payload } = e.data

				if (type === "open") {
					this.#handleOpen(e)
				}
				if (type === "close") {
					this.#handleClose(payload)
				}
				if (type === "error") {
					this.#handleError(e)
				}
				if (type === "message") {
					this.#handleMessage({ data: payload } as MessageEvent)
				}
				if (type === "ping_sent") {
					this.state.lastPing = payload
					this.state.lastPong = null
				}
			}
		} else {
			this.socket = new WebSocket(url)

			this.socket.onopen = (e: Event) => this.#handleOpen(e)
			this.socket.onclose = (e: CloseEvent) => this.#handleClose(e)
			this.socket.onerror = (e: Event) => this.#handleError(e)
			this.socket.onmessage = (e: MessageEvent) => this.#handleMessage(e)
		}

		return new Promise((resolve, reject) => {
			this.once("connected", resolve)
		})
	}

	/**
	 * Permanently close the client connection,
	 * cancels any pending reconnection attempts, clears timers and prevents further reconnection.
	 */
	destroy(): void {
		if (!this.socket && !this.state.reconnecting) {
			return
		}

		console.log(`[rt] Destroying connection`)

		// if is not reconnecting, unsubscribe from all topics
		if (!this.state.reconnecting) {
			this.topics.unsubscribeAll()
		}

		// clear active timers
		if (this.#heartbeatTimer) {
			clearTimeout(this.#heartbeatTimer)
		}
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer)
		}

		// abort
		this.abortController.abort()

		// close & reset
		this.#cleanupSocket()

		// reset reconection state
		this.state.reconnecting = false
		this.state.connectionRetryCount = 0
		this.handlers.clear()
	}

	/**
	 * Authenticates the client socket with a token,
	 * Sending the "authenticate" event to the server.
	 *
	 * @param token {string | Function} - The token to authenticate with.
	 */
	authenticate = async (token: string | Function) => {
		this.params.token = token

		if (typeof token === "function") {
			token = await token()
		}

		this.emit("authenticate", token)
	}

	/**
	 * Registers an event handler.
	 *
	 * @param {string} event - Event name to listen for.
	 * @param {Function} handler - Function to call when the event is received.
	 * @param {boolean} [once=false] - Whether the handler should be called only once.
	 */
	on = (event: string, handler: Function, once: boolean = false) => {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, new Set())
		}

		// add handler to the set for this event
		this.handlers.get(event)?.add({
			event: event,
			handler: handler,
			once: once,
		})
	}

	/**
	 * Removes an event handler.
	 *
	 * @param {string} event - Event name to stop listening for.
	 * @param {Function} handler - Handler function to remove.
	 */
	off = (event: string, handler: Function) => {
		const eventHandlers = this.handlers.get(event)

		if (!eventHandlers) {
			return
		}

		for (const item of eventHandlers as Set<RTE_EventHandler>) {
			if (item.handler === handler) {
				eventHandlers.delete(item)
				break
			}
		}

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}

	/**
	 * Registers a one-time event handler.
	 * The handler will be automatically removed after the first time it's called.
	 *
	 * @param {string} event - Event name to listen for.
	 * @param {Function} handler - Function to call when the event is received.
	 */
	once = (event: string, handler: Function) => {
		this.on(event, handler, true)
	}

	/**
	 * Sends an event to the WebSocket server.
	 *
	 * @param {string} event - Event name to emit.
	 * @param {*} data - Data to send with the event.
	 */
	emit = (event: string, data?: any) => {
		if (!this.socket) {
			console.warn(
				`[rt/${this.params.refName}] Cannot emit event "${event}" - socket is not setted`,
			)
			return
		}

		if (
			this.params.worker !== true &&
			this.socket.readyState !== WebSocket.OPEN
		) {
			console.warn(
				`[rt/${this.params.refName}] Cannot emit event "${event}" - socket is not open`,
			)
			return
		}

		if (this.params.worker === true && !this.state.connected) {
			console.warn(
				`[rt/${this.params.refName}] Cannot emit event "${event}" - socket is not connected`,
			)
			return
		}

		const payload = this.#_encode({ event, data })

		if (this.params.worker === true) {
			this.socket.postMessage({ type: "send", payload })
		} else {
			this.socket.send(payload)
		}
	}

	/**
	 * Sends an event to the WebSocket server and returns a message from the server.
	 *
	 * @param {string} event - Event name to emit.
	 * @param {*} data - Data to send with the event.
	 * @param {number} [timeout=10000] - Time in ms to wait for response before rejecting.
	 * @returns {Promise<object|string>} Promise that resolves with the message from the server.
	 */
	call = (
		event: string,
		data: any,
		timeout: number = RTEngineClient.callTimeout,
	): Promise<object | string> => {
		return new Promise((resolve, reject) => {
			if (!this.socket) {
				return reject(new Error("Socket not connected"))
			}

			if (
				this.params.worker !== true &&
				this.socket.readyState !== WebSocket.OPEN
			) {
				return reject(new Error("Socket not connected"))
			}

			if (this.params.worker === true && !this.state.connected) {
				return reject(new Error("Socket not connected"))
			}

			// Reference to remove the handler later
			const handlerObj = {
				event: event,
				handler: (
					data: any,
					payload: { error?: any; ack?: boolean },
				) => {
					clearTimeout(timerId)

					if (payload.error) {
						return reject(payload.error)
					}

					if (payload.ack) {
						return resolve(data)
					}
				},
				once: true,
				ack: true,
			}

			// Timeout safety net
			const timerId = setTimeout(() => {
				const eventHandlers = this.handlers.get(event)

				if (eventHandlers) {
					eventHandlers.delete(handlerObj)

					if (eventHandlers.size === 0) {
						this.handlers.delete(event)
					}
				}
				reject(new Error(`Call timeout for event: ${event}`))
			}, timeout)

			if (!this.handlers.has(event)) {
				this.handlers.set(event, new Set())
			}

			this.handlers.get(event)?.add(handlerObj)

			const payload = this.#_encode({ event, data, ack: true })

			if (this.params.worker === true) {
				this.socket.postMessage({ type: "send", payload })
			} else {
				this.socket.send(payload)
			}
		})
	}

	/**
	 * Removes all event listeners registered.
	 */
	removeAllListeners = (): void => {
		this.handlers.clear()
	}

	/**
	 * Encodes a payload to JSON string.
	 *
	 * @private
	 * @param {Object} payload - Payload to encode.
	 * @returns {string} JSON string.
	 */
	#_encode(payload: any): string {
		return JSON.stringify(payload)
	}

	/**
	 * Decodes a JSON string into an object.
	 *
	 * @private
	 * @param {string} payload - JSON string to decode.
	 * @returns {Object} Decoded object.
	 */
	#_decode(payload: string): any {
		return JSON.parse(payload)
	}

	/**
	 * Cleans up socket event listeners and closes the connection.
	 *
	 * @private
	 */
	#cleanupSocket(): void {
		if (this.socket) {
			if (this.params.worker === true) {
				this.socket.postMessage({ type: "close" })
				this.socket.terminate()
			} else {
				this.socket.onopen = null
				this.socket.onclose = null
				this.socket.onerror = null
				this.socket.onmessage = null
				this.socket.close()
			}
			this.socket = null
		}
	}

	/**
	 * Handles WebSocket open event.
	 *
	 * @private
	 * @param {Event} e - WebSocket open event.
	 */
	#handleOpen(e: Event): void {
		this.state.connected = true
		this.state.connectionRetryCount = 0

		if (this.state.reconnecting === true) {
			console.log(
				`[rt/${this.params.refName}] Connection reconnected at retry [${this.state.connectionRetryCount}]`,
			)
			this.#dispatchToHandlers("reconnected")
		}

		this.state.reconnecting = false
		this.#dispatchToHandlers("open")

		// if heartbeat is enabled, start the heartbeat check
		if (this.params.heartbeat === true && this.params.worker !== true) {
			this.#heartbeat()
		}
	}

	/**
	 * Handles WebSocket close event.
	 *
	 * @private
	 * @param {CloseEvent} e - WebSocket close event.
	 */
	#handleClose(e: CloseEvent): void {
		this.state.connected = false

		if (this.#heartbeatTimer) {
			clearTimeout(this.#heartbeatTimer)
		}

		this.#dispatchToHandlers("close")

		// if auto reconnect is enabled, try to reconnect
		if (
			this.params.autoReconnect === true &&
			!this.abortController.signal.aborted
		) {
			this.#tryReconnect()
		}
	}

	/**
	 * Handles WebSocket error event.
	 *
	 * @private
	 * @param {Event} error - WebSocket error event.
	 */
	#handleError(error: Event): void {
		this.#dispatchToHandlers("error", error)
	}

	/**
	 * Handles WebSocket message event.
	 *
	 * @private
	 * @param {MessageEvent} event - WebSocket message event.
	 */
	#handleMessage(event: MessageEvent): void {
		try {
			const payload = this.#_decode(event.data)

			if (typeof payload.event !== "string") {
				// Silently ignore or log warning for invalid format
				return
			}

			if (payload.event === "pong") {
				this.state.lastPong = performance.now()

				if (this.state.lastPing !== null) {
					this.state.latency = Number(
						(this.state.lastPong - this.state.lastPing).toFixed(2),
					)
				}
			}

			this.#dispatchToHandlers("message", payload.data, payload)
			this.#dispatchToHandlers(payload.event, payload.data, payload)
		} catch (error) {
			console.error(
				`[rt/${this.params.refName}] Error handling message:`,
				error,
			)
		}
	}

	/**
	 * Built-in event handlers for common events.
	 *
	 * @type {Object}
	 */
	baseHandlers: Record<string, Function> = {
		connected: handlers.connected.bind(this),
		reconnected: handlers.reconnected.bind(this),
		error: handlers.error.bind(this),
		pong: handlers.pong.bind(this),
		"topic:subscribed": handlers.topicSubscribed.bind(this),
		"topic:unsubscribed": handlers.topicUnsubscribed.bind(this),
	}

	/**
	 * Heartbeat the connection to check if its still alive.
	 *
	 * @private
	 * @returns {null|void} Null if not connected, void otherwise.
	 */
	#heartbeat(): void | null {
		if (!this.state.connected || this.abortController.signal.aborted) {
			return null
		}

		if (this.params.worker === true) {
			console.warn(
				`[rt/${this.params.refName}] heartbeat trigger called in worker context mode, ignoring`,
			)
			return null
		}

		// reset last pong and last ping
		this.state.lastPong = null
		this.state.lastPing = performance.now()

		// send the ping
		this.emit("ping")

		// wait to time out
		this.#heartbeatTimer = setTimeout(() => {
			if (this.abortController.signal.aborted) {
				return null
			}

			// if no last pong is received, it means the connection is lost or the latency is too high
			if (this.state.lastPong === null) {
				// Force close, this will trigger onclose which triggers tryReconnect
				if (this.socket) {
					if (this.params.worker === true) {
						this.socket.postMessage({ type: "close" })
					} else {
						this.socket.close()
					}
				}
				return
			}

			// calculate latency
			this.state.latency = Number(
				(this.state.lastPong - (this.state.lastPing ?? 0)).toFixed(2),
			)

			// send the heartbeat again
			this.#heartbeat()
		}, RTEngineClient.heartbeatTimeout)
	}

	/**
	 * Attempts to reconnect to the WebSocket server.
	 *
	 * @private
	 * @returns {null|void} Null if max retries reached, void otherwise.
	 */
	#tryReconnect(): void | null {
		if (this.abortController.signal.aborted) {
			return null
		}

		if (
			this.state.reconnecting &&
			this.params.worker !== true &&
			this.socket?.readyState === WebSocket.CONNECTING
		) {
			return null
		}

		// check if retries are left, if so, retry connection
		if (
			this.params.maxConnectRetries !== Infinity &&
			this.state.connectionRetryCount >= this.params.maxConnectRetries
		) {
			console.error(
				`[rt/${this.params.refName}] Reconnection failed: Maximum retries reached [${this.params.maxConnectRetries}]\nClosing socket permanently...`,
			)
			this.#dispatchToHandlers("reconnection_failed")
			return null
		}

		this.state.connectionRetryCount = this.state.connectionRetryCount + 1
		this.state.reconnecting = true

		console.log(
			`[rt/${this.params.refName}] Connection timeout, retrying connection in ${RTEngineClient.reconnectTimeout}ms [${this.state.connectionRetryCount}/${this.params.maxConnectRetries}]`,
		)

		this.#dispatchToHandlers("reconnecting")

		this.#cleanupSocket()

		this.#reconnectTimer = setTimeout(() => {
			this.connect().catch((err) =>
				console.error("Reconnect failed", err),
			)
		}, RTEngineClient.reconnectTimeout)
	}

	/**
	 * Dispatches events to registered handlers.
	 *
	 * @private
	 * @param {string} event - Event name to dispatch.
	 * @param {*} data - Event data.
	 * @param {Object} [payload] - Full event payload.
	 * @returns {Promise<void>} Promise that resolves when all handlers have been called.
	 */
	async #dispatchToHandlers(
		event: string,
		data?: any,
		payload: { error?: any; ack?: boolean } = {},
	): Promise<void> {
		if (this.baseHandlers[event]) {
			await this.baseHandlers[event](data, payload)
		}

		const eventHandlers = this.handlers.get(event)

		if (!eventHandlers) {
			return
		}

		for (const reg of [...(eventHandlers as Set<RTE_EventHandler>)]) {
			if (reg.ack === true && !payload.ack) {
				continue
			}

			try {
				await reg.handler(data, payload)
			} catch (error) {
				console.error(`[rt] Handler error for event '${event}':`, error)
			}

			if (reg.once === true) {
				eventHandlers.delete(reg)
			}
		}

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}
}

export default RTEngineClient
