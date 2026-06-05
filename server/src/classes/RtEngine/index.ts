/**
 * RTEngine — Real-Time Engine (WebSocket subsystem) for Linebridge.
 *
 * Built on top of uWebSockets.js, RTEngine manages WebSocket connections,
 * event dispatching, topic-based pub/sub, and optional NATS federation.
 *
 * Key responsibilities:
 * - Wrapping raw uWS sockets into Client instances
 * - Registering and dispatching event handlers (built-in + user-defined)
 * - Handling HTTP-to-WebSocket upgrade with optional token validation
 * - Tracking connected clients in a Clients collection
 * - Delegating send/find operations to NATS when running in gateway mode
 *
 * @module RtEngine
 */

import Clients from "./classes/clients"
import BuiltInEvents from "./events"
import Handler, { HandlerKind } from "../Handler"

import findClientsByUserId from "./handlers/findClientsByUserId"
import handleMessage from "./handlers/message"
import handleConnection from "./handlers/connection"
import handleDisconnect from "./handlers/disconnect"
import handleUpgrade from "./handlers/upgrade"

import sendToTopic from "./handlers/sendToTopic"
import sendToClientId from "./handlers/sendToClientId"
import sendToUserId from "./handlers/sendToUserId"

import type Server from "../../server"
import type { RtEngineConfig, RtEngineSocket } from "./types"

class RTEngine {
	/** The parent Linebridge Server instance */
	server: Server

	/** Configuration passed at construction time */
	config: RtEngineConfig

	/** The uWebSockets.js app instance (populated by attach()) */
	engine: any = null

	/** Map of registered event handlers (built-in + user-defined) */
	events: Map<string, Handler> = new Map()

	/** Collection of currently connected clients */
	clients: Clients = new Clients(this)

	/** Upgrade hook from config (custom token validation) */
	onUpgrade: RtEngineConfig["onUpgrade"]

	/** Connection hook from config */
	onConnection: RtEngineConfig["onConnection"]

	/** Disconnect hook from config */
	onDisconnect: RtEngineConfig["onDisconnect"]

	/**
	 * Sender functions for delivering messages to clients.
	 *
	 * Each function checks if NATS is available and delegates accordingly:
	 * - Gateway mode: the request is forwarded to NATS
	 * - Local mode: the action is performed directly on the local engine
	 */
	senders = {
		toTopic: sendToTopic.bind(this),
		toClientId: sendToClientId.bind(this),
		toUserId: sendToUserId.bind(this),
	}

	/**
	 * Finder functions for locating clients.
	 *
	 * Delegates to NATS when running in gateway mode, otherwise
	 * searches the local Clients collection.
	 */
	find = {
		clientsByUserId: findClientsByUserId.bind(this),
	}

	/**
	 * Creates a new RTEngine instance.
	 *
	 * Registers user-defined events from config, merges built-in events,
	 * and stores the upgrade/connection/disconnect hooks.
	 *
	 * @param server - The parent Linebridge Server instance
	 * @param config - Configuration options for this engine
	 */
	constructor(server: Server, config: RtEngineConfig = {}) {
		this.server = server
		this.config = config

		this.events = new Map()

		// Register user-defined events from the config
		if (typeof config.events === "object") {
			for (const [event, handler] of Object.entries(config.events)) {
				this.events.set(
					event,
					new Handler({
						kind: HandlerKind.ws,
						engine: this.server.engine,
						event,
						fn: handler,
					} as any),
				)
			}
		}

		// Register built-in events (ping, etc.) — these can be overridden by user events above
		for (const [event, handler] of Object.entries(BuiltInEvents)) {
			this.events.set(
				event,
				new Handler({
					kind: HandlerKind.ws,
					engine: this.server.engine,
					event,
					fn: handler,
				} as any),
			)
		}

		// Store lifecycle hooks, defaulting to null
		this.onUpgrade = config.onUpgrade || null
		this.onConnection = config.onConnection || null
		this.onDisconnect = config.onDisconnect || null
	}

	/** Bound message handler — dispatches incoming WebSocket messages */
	handleMessage = handleMessage.bind(this)

	/** Bound connection handler — called when a new WebSocket connects */
	handleConnection = handleConnection.bind(this)

	/** Bound disconnect handler — called when a WebSocket closes */
	handleDisconnect = handleDisconnect.bind(this)

	/** Bound upgrade handler — validates and upgrades HTTP to WebSocket */
	handleUpgrade = handleUpgrade.bind(this)

	/**
	 * Registers a single event handler.
	 *
	 * Accepts either a plain function or an object with a `fn` property.
	 * The handler replaces any previously registered handler for the same event.
	 *
	 * @param event   - The event name to register
	 * @param handler - A function or an object with a `fn` function
	 */
	registerEvent = (event: string, handler: any) => {
		// Allow passing an object that wraps the function
		if (typeof handler === "function") {
			handler = { fn: handler }
		}

		if (!handler.fn) {
			console.error("Event handler must have a function")
			return
		}

		// Wrap in a Handler instance for uniform dispatch
		const wsHandler = new Handler({
			kind: HandlerKind.ws,
			engine: this.server.engine,
			event,
			fn: handler.fn,
		} as any)

		this.events.set(event, wsHandler)
	}

	/**
	 * Registers multiple event handlers at once.
	 *
	 * Each entry in the object is passed to registerEvent().
	 *
	 * @param obj - Object mapping event names to handler functions or objects
	 */
	registerEvents = (obj: Record<string, any>) => {
		for (const [event, handler] of Object.entries(obj)) {
			this.registerEvent(event, handler)
		}
	}

	/**
	 * Attaches the RTEngine to a uWebSockets.js app.
	 *
	 * Registers the WebSocket route (with configurable path) and the
	 * HTTP-to-WebSocket upgrade route. This must be called after creating
	 * the uWS app.
	 *
	 * @param engine - The uWebSockets.js app instance
	 */
	attach = (engine: any) => {
		if (typeof engine !== "undefined") {
			this.engine = engine
		}

		// WebSocket route: handles connected clients and incoming messages
		this.engine.app.ws(this.config.path ?? "/", this.handleConnection)

		// Upgrade route: handles HTTP-to-WebSocket upgrade with token validation
		this.engine.app.upgrade(this.config.path ?? "/", this.handleUpgrade)
	}

	/**
	 * Placeholder for cleanup logic when the engine is shut down.
	 */
	close = () => {}

	/**
	 * Encodes data as a JSON string for transmission over WebSocket.
	 *
	 * @param data - The data to encode
	 * @returns JSON string
	 */
	encode = (data: any): string => {
		return JSON.stringify(data)
	}

	/**
	 * Decodes a JSON string received over WebSocket back into an object.
	 *
	 * @param data - The JSON string to decode
	 * @returns Parsed object
	 */
	decode = (data: any): any => {
		return JSON.parse(data)
	}
}

export default RTEngine
