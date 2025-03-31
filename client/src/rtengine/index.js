import TopicsController from "./topics"
import { version } from "../../package.json"

/**
 * WebSocket client for real-time communication with a backend service.
 * Provides connection management, automatic reconnection, heartbeat monitoring,
 * event handling, and topic-based subscriptions.
 */
export class RTEngineClient {
	/**
	 * Creates a new RTEngineClient instance.
	 *
	 * @param {Object} [params={}] - Configuration parameters for the client.
	 * @param {string} [params.refName="default"] - Reference name for this client instance.
	 * @param {boolean} [params.autoReconnect=true] - Whether to automatically attempt reconnection.
	 * @param {number} [params.maxConnectRetries=Infinity] - Maximum number of reconnection attempts.
	 * @param {boolean} [params.heartbeat=true] - Whether to use heartbeat to monitor connection health.
	 * @param {string} [params.url] - WebSocket server URL to connect to.
	 * @param {string} [params.token] - Authentication token to include in the connection.
	 */
	constructor(params = {}) {
		this.params = {
			refName: "default",
			autoReconnect: true,
			maxConnectRetries: Infinity,
			heartbeat: true,
			...params,
		}
	}

	/** @type {string} Client library version */
	static version = version
	/** @type {number} Timeout for heartbeat checks in milliseconds */
	static heartbeatTimeout = 10000
	/** @type {number} Delay between reconnection attempts in milliseconds */
	static reconnectTimeout = 5000

	/**
	 * Gets the current library version.
	 *
	 * @returns {string} Current version string.
	 */
	get version() {
		return this.constructor.version
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
	state = {
		id: null,
		connected: false,
		authenticated: false,
		lastPing: null,
		lastPong: null,
		latency: null,
		reconnecting: false,
		connectionRetryCount: 0,
	}

	/** @type {WebSocket|null} Active WebSocket connection */
	socket = null

	/** @type {Set} Collection of event handlers */
	handlers = new Set()

	/** @type {TopicsController} Controller for topic-based subscriptions */
	topics = new TopicsController(this)

	/**
	 * Establishes a connection to the WebSocket server.
	 * Automatically disconnects any existing connection first.
	 *
	 * @returns {Promise<void>} Promise that resolves when the connection is established.
	 */
	async connect() {
		if (this.socket) {
			await this.disconnect()
		}

		let url = `${this.params.url}`

		if (this.params.token) {
			url += `?token=${this.params.token}`
		}

		this.socket = new WebSocket(url)

		this.socket.onopen = (e) => this.#handleOpen(e)
		this.socket.onclose = (e) => this.#handleClose(e)
		this.socket.onerror = (e) => this.#handleError(e)
		this.socket.onmessage = (e) => this.#handleMessage(e)

		return new Promise((resolve, reject) => {
			this.once("connected", resolve)
		})
	}

	/**
	 * Closes the current WebSocket connection.
	 *
	 * @returns {Promise<boolean>} Promise resolving to false if no connection exists, true otherwise.
	 */
	async disconnect() {
		if (!this.socket) {
			return false
		}

		if (!this.state.reconnecting) {
			this.topics.unsubscribeAll()
		}

		this.socket.close()
		this.socket = null

		return true
	}

	/**
	 * Registers an event handler.
	 *
	 * @param {string} event - Event name to listen for.
	 * @param {Function} handler - Function to call when the event is received.
	 */
	on = (event, handler) => {
		this.handlers.add({
			event,
			handler,
		})
	}

	/**
	 * Removes an event handler.
	 *
	 * @param {string} event - Event name to stop listening for.
	 * @param {Function} handler - Handler function to remove.
	 */
	off = (event, handler) => {
		this.handlers.delete({
			event,
			handler,
		})
	}

	/**
	 * Registers a one-time event handler.
	 * The handler will be automatically removed after the first time it's called.
	 *
	 * @param {string} event - Event name to listen for.
	 * @param {Function} handler - Function to call when the event is received.
	 */
	once = (event, handler) => {
		this.handlers.add({
			event,
			handler,
			once: true,
		})
	}

	/**
	 * Sends an event to the WebSocket server.
	 *
	 * @param {string} event - Event name to emit.
	 * @param {*} data - Data to send with the event.
	 * @returns {Promise<null|void>} Promise that resolves when the event is sent, or null if not connected.
	 */
	emit = async (event, data) => {
		// TODO: implement a msg queue
		if (!this.socket || !this.state.connected) {
			return null
		}

		return await this.socket.send(this.#_encode({ event, data }))
	}

	/**
	 * Encodes a payload to JSON string.
	 *
	 * @private
	 * @param {Object} payload - Payload to encode.
	 * @returns {string} JSON string.
	 */
	#_encode(payload) {
		return JSON.stringify(payload)
	}

	/**
	 * Decodes a JSON string into an object.
	 *
	 * @private
	 * @param {string} payload - JSON string to decode.
	 * @returns {Object} Decoded object.
	 */
	#_decode(payload) {
		return JSON.parse(payload)
	}

	/**
	 * Handles WebSocket open event.
	 *
	 * @private
	 * @param {Event} e - WebSocket open event.
	 */
	#handleOpen(e) {
		if (this.state.reconnecting === true) {
			console.log(
				`[rt/${this.params.refName}] Connection reconnected at retry [${this.state.connectionRetryCount}]`,
			)
			this.#dispatchToHandlers("reconnected")
		}

		this.state.connected = true
		this.state.connectionRetryCount = 0
		this.state.reconnecting = false

		this.#dispatchToHandlers("open")

		// if heartbeat is enabled, start the heartbeat check
		if (this.params.heartbeat === true) {
			this.#startHeartbeat()
		}
	}

	/**
	 * Handles WebSocket close event.
	 *
	 * @private
	 * @param {CloseEvent} e - WebSocket close event.
	 */
	#handleClose(e) {
		this.state.connected = false
		this.#dispatchToHandlers("close")

		if (this.params.autoReconnect === true) {
			return this.#tryReconnect()
		}
	}

	/**
	 * Handles WebSocket error event.
	 *
	 * @private
	 * @param {Event} error - WebSocket error event.
	 */
	#handleError(error) {
		this.#dispatchToHandlers("error", error)
	}

	/**
	 * Handles WebSocket message event.
	 *
	 * @private
	 * @param {MessageEvent} event - WebSocket message event.
	 */
	#handleMessage(event) {
		try {
			const payload = this.#_decode(event.data)

			if (typeof payload.event !== "string") {
				throw new Error("Invalid event or payload")
			}

			return this.#dispatchToHandlers(
				payload.event,
				payload.data,
				payload,
			)
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
	baseHandlers = {
		/**
		 * Handles the 'connected' event.
		 *
		 * @param {Object} data - Connection data from server.
		 */
		connected: (data) => {
			if (data.id) {
				this.state.id = data.id
				this.state.authenticated = data.authenticated
			}
		},
		/**
		 * Handles the 'reconnected' event.
		 *
		 * @param {Object} data - Reconnection data.
		 */
		reconnected: (data) => {
			this.topics.regenerate()
		},
		/**
		 * Handles error events.
		 *
		 * @param {Error} error - Error object.
		 */
		error: (error) => {
			console.error(
				`[rt/${this.params.refName}] Connection error:`,
				error,
			)
		},
		/**
		 * Handles pong responses for heartbeat.
		 *
		 * @param {Object} data - Pong data.
		 */
		pong: (data) => {
			this.state.lastPong = performance.now()
		},
	}

	/**
	 * Starts the heartbeat process to monitor connection health.
	 *
	 * @private
	 * @returns {null|void} Null if not connected, void otherwise.
	 */ #startHeartbeat() {
		if (!this.state.connected) {
			return null
		}

		this.state.lastPong = null
		this.state.lastPing = performance.now()

		this.emit("ping").catch(() => null)

		setTimeout(() => {
			// if no last pong is received, it means the connection is lost or the latency is too high
			if (this.state.lastPong === null) {
				this.state.connected = false

				// if max connect retries is more than 0, retry connections
				if (this.params.autoReconnect === true) {
					return this.#tryReconnect()
				}
			}

			this.state.latency = Number(
				this.state.lastPong - this.state.lastPing,
			).toFixed(2)

			this.#startHeartbeat()
		}, this.constructor.heartbeatTimeout)
	}

	/**
	 * Attempts to reconnect to the WebSocket server.
	 *
	 * @private
	 * @returns {null|void} Null if max retries reached, void otherwise.
	 */
	#tryReconnect() {
		// check if retries are left, if so, retry connection
		if (
			this.params.maxConnectRetries !== Infinity &&
			this.state.connectionRetryCount > this.params.maxConnectRetries
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
			`[rt/${this.params.refName}] Connection timeout, retrying connection in ${this.constructor.reconnectTimeout}ms [${this.state.connectionRetryCount - 1}/${this.params.maxConnectRetries}]`,
		)

		setTimeout(() => {
			this.connect()
		}, this.constructor.reconnectTimeout)
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
	async #dispatchToHandlers(event, data) {
		if (this.baseHandlers[event]) {
			await this.baseHandlers[event](data)
		}

		for (const handler of this.handlers) {
			if (handler.event === event) {
				handler.handler(data)

				if (handler.once === true) {
					this.handlers.delete(handler)
				}
			}
		}
	}
}

export default RTEngineClient
