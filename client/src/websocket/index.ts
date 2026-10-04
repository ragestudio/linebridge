import type { EventHandler } from "../types"

import {
	CALL_TIMEOUT,
	DEFAULT_PARAMS,
	HEARTBEAT_GRACE_PERIOD,
	HEARTBEAT_INTERVAL,
	RECONNECT_TIMEOUT,
	VERSION,
} from "./constants"

import { decode, encode } from "./codec"
import baseHandlersFactory from "./base-handlers"
import ConnectionController from "./connection"
import EventRegistry from "./events"
import HeartbeatController from "./heartbeat"
import ReconnectController from "./reconnect"
import TopicsController from "./topics"
import rpc from "./rpc"
import { Logger } from "../logger"

import type {
	ClientParams,
	ClientState,
	CoreEvents,
	EventData,
	EventPayload,
	EventHandlerFunction,
} from "./types"

export type {
	ClientParams,
	ClientState,
	CoreEvents,
	EventData,
	EventPayload,
	EventHandlerFunction,
} from "./types"

/**
 * WebSocket client for real-time communication with a backend service.
 * Provides connection management, automatic reconnection, heartbeat monitoring,
 * event handling, and topic-based subscriptions.
 */
export class WebsocketClient<CustomEvents extends Record<string, any> = {}> {
	constructor(params: ClientParams) {
		if (!params) {
			throw new Error("Invalid parameters provided")
		}

		this.params = {
			...DEFAULT_PARAMS,
			...params,
		}

		this.logger = new Logger(`rt/${this.params.refName}`)

		// @ts-ignore
		globalThis.__rte_client_version__ = VERSION
	}

	params: ClientParams
	abortController = new AbortController()

	/** Client library version */
	static version: string = VERSION
	/** Time for heartbeat checks in milliseconds */
	static heartbeatInterval: number = HEARTBEAT_INTERVAL
	/** Grace period to kill a connection that has not responded to a heartbeat in milliseconds */
	static heartbeatGracePeriod: number = HEARTBEAT_GRACE_PERIOD

	/** Delay between reconnection attempts in milliseconds */
	static reconnectTimeout: number = RECONNECT_TIMEOUT
	/** Default timeout for RPC calls in milliseconds */
	static callTimeout: number = CALL_TIMEOUT

	/**
	 * Gets the current library version.
	 */
	get version(): string {
		return WebsocketClient.version
	}

	/**
	 * Client state object.
	 */
	state: ClientState = {
		id: null,
		connected: false,
		authenticated: false,
		lastPing: null,
		reconnecting: false,
		connectionRetryCount: 0,
	}

	/** Active WebSocket connection */
	socket: WebSocket | null = null

	/** Client logger */
	logger: Logger = new Logger()

	/** Registry of local event handlers */
	events: EventRegistry = new EventRegistry(this)

	/** Socket lifecycle controller */
	connection: ConnectionController = new ConnectionController(this)

	/** Heartbeat watchdog controller */
	heartbeatController: HeartbeatController = new HeartbeatController(this)

	/** Reconnection controller */
	reconnectController: ReconnectController = new ReconnectController(this)

	/** Controller for topic-based subscriptions */
	topics: TopicsController = new TopicsController(this)

	/** Built-in event handlers for common events */
	baseHandlers: Record<string, Function> = baseHandlersFactory(this)

	/**
	 * Collection of event handlers.
	 */
	get handlers(): Map<string, Set<EventHandler>> {
		return this.events.handlers
	}

	/**
	 * Establishes a connection to the WebSocket server.
	 * Automatically disconnects any existing connection first.
	 */
	async connect(): Promise<void> {
		return this.connection.connect()
	}

	/**
	 * Permanently close the client connection,
	 * cancels any pending reconnection attempts, clears timers and prevents further reconnection.
	 */
	destroy(): void {
		if (!this.socket && !this.state.reconnecting) {
			return
		}

		this.logger.log("Destroying connection")

		if (!this.state.reconnecting) {
			this.topics.unsubscribeAll()
		}

		this.heartbeatController.stop()
		this.reconnectController.stop()

		this.abortController.abort()
		this.connection.cleanup()

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

		this.emit("authenticate", token as any)
	}

	/**
	 * Registers an event handler.
	 */
	on = <K extends keyof (CoreEvents & CustomEvents) | (string & {})>(
		event: K,
		handler: EventHandlerFunction<EventData<CoreEvents & CustomEvents, K>>,
		once: boolean = false,
	) => {
		this.events.on(event as string, handler as Function, once)
	}

	/**
	 * Removes an event handler.
	 */
	off = <K extends keyof (CoreEvents & CustomEvents) | (string & {})>(
		event: K,
		handler: EventHandlerFunction<EventData<CoreEvents & CustomEvents, K>>,
	) => {
		this.events.off(event as string, handler as Function)
	}

	/**
	 * Registers a one-time event handler.
	 * The handler will be automatically removed after the first time it's called.
	 */
	once = <K extends keyof (CoreEvents & CustomEvents) | (string & {})>(
		event: K,
		handler: EventHandlerFunction<EventData<CoreEvents & CustomEvents, K>>,
	) => {
		this.on(event, handler, true)
	}

	/**
	 * Sends an event to the WebSocket server.
	 */
	emit = <K extends keyof (CoreEvents & CustomEvents) | (string & {})>(
		event: K,
		data?: EventData<CoreEvents & CustomEvents, K>,
	) => {
		this.connection.send(event as string, data)
	}

	/**
	 * Sends an event to the WebSocket server and returns a message from the server.
	 */
	call = <
		K extends keyof (CoreEvents & CustomEvents) | (string & {}),
		R = any,
	>(
		event: K,
		data?: EventData<CoreEvents & CustomEvents, K>,
		timeout: number = WebsocketClient.callTimeout,
	): Promise<R> => {
		return rpc<R>(this, event as string, data, timeout)
	}

	/**
	 * Removes all event listeners registered.
	 */
	removeAllListeners = (): void => {
		this.events.removeAllListeners()
	}

	/**
	 * Encodes a payload to JSON string.
	 */
	protected _encode(payload: any): string {
		return encode(payload)
	}

	/**
	 * Decodes a JSON string into an object.
	 */
	protected _decode(payload: string): any {
		return decode(payload)
	}

	/**
	 * Dispatches events to registered handlers.
	 */
	async dispatchToHandlers(
		event: string,
		data?: any,
		payload: EventPayload = {},
	): Promise<void> {
		return this.events.dispatch(event, data, payload)
	}

	/**
	 * Heartbeat the connection to check if its still alive.
	 */
	heartbeat(): void | null {
		return this.heartbeatController.start(
			WebsocketClient.heartbeatInterval,
			WebsocketClient.heartbeatGracePeriod,
		)
	}

	/**
	 * Attempts to reconnect to the WebSocket server.
	 */
	tryReconnect(): void | null {
		return this.reconnectController.tryReconnect(
			WebsocketClient.reconnectTimeout,
		)
	}
}

export default WebsocketClient
