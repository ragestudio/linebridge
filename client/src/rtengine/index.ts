import { version } from "../../package.json"

import TopicsController from "./topics"
import handlers from "./handlers"

export type RTEClientParams = {
	url: string
	token?: string | Function
	refName?: string
	maxConnectRetries?: number
	autoReconnect?: boolean
	heartbeat?: boolean
	worker?: boolean
}

export type RTE_ClientState = {
	id: string | null
	connected: boolean
	authenticated: boolean
	lastPing: number | null
	reconnecting: boolean
	connectionRetryCount: number
}

export type RTE_EventHandler = {
	event: string // the event name to listen for
	handler: Function // the function to call when the event is emitted
	once: boolean // if true, the handler will be removed after the first invocation
	ack?: boolean // defined to indicate if the handler expects an acknowledgment
}

/**
 * WebSocket client for real-time communication with a backend service.
 * Provides connection management, automatic reconnection, heartbeat monitoring,
 * event handling, and topic-based subscriptions.
 */
export class RTEngineClient {
	constructor(params: RTEClientParams) {
		if (!params) {
			throw new Error("Invalid parameters provided")
		}

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

	params: RTEClientParams
	abortController = new AbortController()

	/** Client library version */
	static version: string = version
	/** Time for heartbeat checks in milliseconds */
	static heartbeatInterval: number = 25000
	/**  Grace period to kill a connection that has not responded to a heartbeat in milliseconds */
	static heartbeatGracePeriod: number = 5000

	/** Delay between reconnection attempts in milliseconds */
	static reconnectTimeout: number = 5000
	/** Default timeout for RPC calls in milliseconds */
	static callTimeout: number = 10000

	/**
	 * Gets the current library version.
	 */
	get version(): string {
		return RTEngineClient.version
	}

	/**
	 * Client state object.
	 */
	state: RTE_ClientState = {
		id: null,
		connected: false,
		authenticated: false,
		lastPing: null,
		reconnecting: false,
		connectionRetryCount: 0,
	}

	/** Active WebSocket connection */
	socket: any = null

	/**
	 * Collection of event handlers.
	 */
	handlers: Map<string, Set<Object>> = new Map()

	/** Controller for topic-based subscriptions */
	topics: TopicsController = new TopicsController(this)

	/** Internal timer reference for heartbeat */
	#heartbeatTimer: ReturnType<typeof setTimeout> | null = null

	/** Internal timer reference for reconnection */
	#reconnectTimer: ReturnType<typeof setTimeout> | null = null

	/**
	 * Establishes a connection to the WebSocket server.
	 * Automatically disconnects any existing connection first.
	 */
	async connect(): Promise<void> {
		if (this.abortController.signal.aborted) {
			this.abortController = new AbortController()
		}

		if (this.socket) {
			this.cleanupSocket()
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
				},
			})

			this.socket.onmessage = (e: MessageEvent) => {
				const { type, payload } = e.data

				if (type === "open") this.handleOpen(e)
				if (type === "close") this.handleClose(payload)
				if (type === "error") this.handleError(e)
				if (type === "message")
					this.handleMessage({ data: payload } as MessageEvent)
			}
		} else {
			this.socket = new WebSocket(url)

			this.socket.onopen = (e: Event) => this.handleOpen(e)
			this.socket.onclose = (e: CloseEvent) => this.handleClose(e)
			this.socket.onerror = (e: Event) => this.handleError(e)
			this.socket.onmessage = (e: MessageEvent) => this.handleMessage(e)
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
		this.cleanupSocket()

		// reset reconection state
		this.state.reconnecting = false
		this.state.connectionRetryCount = 0
		this.handlers.clear()
	}

	/**
	 * Authenticates the client socket with a token,
	 * Sending the "authenticate" event to the server.
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
	 */
	once = (event: string, handler: Function) => {
		this.on(event, handler, true)
	}

	/**
	 * Sends an event to the WebSocket server.
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

		const payload = this._encode({ event, data })

		if (this.params.worker === true) {
			this.socket.postMessage({ type: "send", payload })
		} else {
			this.socket.send(payload)
		}
	}

	/**
	 * Sends an event to the WebSocket server and returns a message from the server.
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

			const payload = this._encode({ event, data, ack: true })

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
	 */
	protected _encode(payload: any): string {
		return JSON.stringify(payload)
	}

	/**
	 * Decodes a JSON string into an object.
	 */
	protected _decode(payload: string): any {
		return JSON.parse(payload)
	}

	/**
	 * Cleans up socket event listeners and closes the connection.
	 */
	private cleanupSocket(): void {
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
	 */
	protected handleOpen(e: Event): void {
		this.state.connected = true
		this.state.connectionRetryCount = 0

		if (this.state.reconnecting === true) {
			console.log(
				`[rt/${this.params.refName}] Connection reconnected at retry [${this.state.connectionRetryCount}]`,
			)
			this.dispatchToHandlers("reconnected")
		}

		this.state.reconnecting = false
		this.dispatchToHandlers("open")

		// set the lastPing as connection time
		this.state.lastPing = performance.now()

		// if heartbeat is enabled, start the heartbeat check
		if (this.params.heartbeat === true) {
			this.heartbeat()
		}
	}

	/**
	 * Handles WebSocket close event.
	 */
	protected handleClose(e: CloseEvent): void {
		this.state.connected = false

		if (this.#heartbeatTimer) {
			clearTimeout(this.#heartbeatTimer)
		}

		this.dispatchToHandlers("close")

		// if auto reconnect is enabled, try to reconnect
		if (
			this.params.autoReconnect === true &&
			!this.abortController.signal.aborted
		) {
			this.tryReconnect()
		}
	}

	/**
	 * Handles WebSocket error event.
	 */
	protected handleError(error: Event): void {
		this.dispatchToHandlers("error", error)
	}

	/**
	 * Handles WebSocket message event.
	 */
	protected handleMessage(event: MessageEvent): void {
		try {
			const payload = this._decode(event.data)

			// console.debug(
			// 	`[rt/${this.params.refName}] #handleMessage:`,
			// 	payload,
			// )

			if (typeof payload.event !== "string") {
				// Silently ignore or log warning for invalid format
				return
			}

			// if is available a serialized error, reconstruct it as an Error instance
			if (payload.error) {
				const syntheticError = new Error(payload.error.message)
				syntheticError.stack = payload.error.stack

				payload.error = syntheticError
			}

			this.dispatchToHandlers("message", payload.data, payload)
			this.dispatchToHandlers(payload.event, payload.data, payload)
		} catch (error) {
			console.error(
				`[rt/${this.params.refName}] Error handling message:`,
				error,
			)
		}
	}

	/**
	 * Heartbeat the connection to check if its still alive.
	 */
	protected heartbeat(): void | null {
		if (!this.state.connected || this.abortController.signal.aborted) {
			return null
		}

		if (this.#heartbeatTimer) {
			clearTimeout(this.#heartbeatTimer)
		}

		this.#heartbeatTimer = setTimeout(() => {
			if (this.abortController.signal.aborted) {
				return null
			}

			console.warn(
				`[rt/${this.params.refName}] Connection timeout, server did not send ping in time`,
			)

			// Force close, this will trigger onclose which triggers tryReconnect
			if (this.socket) {
				if (this.params.worker === true) {
					this.socket.postMessage({ type: "close" })
				} else {
					this.socket.close()
				}
			}
		}, RTEngineClient.heartbeatInterval + RTEngineClient.heartbeatGracePeriod)
	}

	/**
	 * Attempts to reconnect to the WebSocket server.
	 */
	protected tryReconnect(): void | null {
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
			typeof this.params.maxConnectRetries !== "undefined" &&
			this.params.maxConnectRetries !== Infinity &&
			this.state.connectionRetryCount >= this.params.maxConnectRetries
		) {
			console.error(
				`[rt/${this.params.refName}] Reconnection failed: Maximum retries reached [${this.params.maxConnectRetries}]\nClosing socket permanently...`,
			)
			this.dispatchToHandlers("reconnection_failed")
			return null
		}

		this.state.connectionRetryCount = this.state.connectionRetryCount + 1
		this.state.reconnecting = true

		console.log(
			`[rt/${this.params.refName}] Connection timeout, retrying connection in ${RTEngineClient.reconnectTimeout}ms [${this.state.connectionRetryCount}/${this.params.maxConnectRetries}]`,
		)

		this.dispatchToHandlers("reconnecting")

		this.cleanupSocket()

		this.#reconnectTimer = setTimeout(() => {
			this.connect().catch((err) =>
				console.error("Reconnect failed", err),
			)
		}, RTEngineClient.reconnectTimeout)
	}

	/**
	 * Dispatches events to registered handlers.
	 */
	protected async dispatchToHandlers(
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

		// console.debug(`[rt/${this.params.refName}] #dispatchToHandlers:`, {
		// 	event,
		// 	data,
		// 	payload,
		// })

		for (const reg of [...(eventHandlers as Set<RTE_EventHandler>)]) {
			if (reg.ack === true && !payload.ack) {
				continue
			}

			try {
				await reg.handler(data, payload)

				if (payload.error instanceof Error) {
					throw payload.error
				}
			} catch (error) {
				console.error(
					`[rt/${this.params.refName}] Event handler error ["${event}"]:\n\n`,
					error,
				)
			}

			if (reg.once === true) {
				eventHandlers.delete(reg)
			}
		}

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}

	/**
	 * Built-in event handlers for common events.
	 */
	baseHandlers: Record<string, Function> = {
		connected: handlers.connected.bind(this) as OmitThisParameter<
			typeof handlers.connected
		>,
		reconnected: handlers.reconnected.bind(this) as OmitThisParameter<
			typeof handlers.reconnected
		>,
		error: handlers.error.bind(this) as OmitThisParameter<
			typeof handlers.error
		>,
		ping: handlers.ping.bind(this) as OmitThisParameter<
			typeof handlers.ping
		>,
		"topic:subscribed": handlers.topicSubscribed.bind(
			this,
		) as OmitThisParameter<typeof handlers.topicSubscribed>,
		"topic:unsubscribed": handlers.topicUnsubscribed.bind(
			this,
		) as OmitThisParameter<typeof handlers.topicUnsubscribed>,
	}
}

export default RTEngineClient
