import Clients from "./classes/clients"
import BuiltInEvents from "./events"
import { WebsocketRequestHandler } from "../Handler"

import findClientsByUserId from "./handlers/findClientsByUserId"
import handleMessage from "./handlers/message"
import handleConnection from "./handlers/connection"
import handleDisconnect from "./handlers/disconnect"
import handleUpgrade from "./handlers/upgrade"

import sendToTopic from "./handlers/sendToTopic"
import sendToClientId from "./handlers/sendToClientId"
import sendToUserId from "./handlers/sendToUserId"

/**
 * real-time websocket engine for handling client connections, events, and messaging
 * provides a comprehensive solution for websocket communication with built-in event handling,
 * client management, topic subscriptions, and broadcasting capabilities
 */
class RTEngine {
	/**
	 * creates a new rtengine instance
	 * @param {Object} server - the server instance to attach to
	 * @param {Object} config - configuration options
	 * @param {Object} config.events - event handlers to register
	 * @param {Function} config.onUpgrade - callback for connection upgrades
	 * @param {Function} config.onConnection - callback for new connections
	 * @param {Function} config.onDisconnect - callback for disconnections
	 * @param {string} config.path - websocket endpoint path (default: "/")
	 */
	constructor(server, config = {}) {
		this.server = server
		this.config = config

		// initialize events map to store all event handlers
		this.events = new Map()

		// register custom events from config if provided
		if (typeof config.events === "object") {
			for (const [event, handler] of Object.entries(config.events)) {
				this.events.set(
					event,
					new WebsocketRequestHandler(this, {
						event: event,
						fn: handler,
					}),
				)
			}
		}

		// register built-in system events
		for (const [event, handler] of Object.entries(BuiltInEvents)) {
			this.events.set(
				event,
				new WebsocketRequestHandler(this, {
					event: event,
					fn: handler,
				}),
			)
		}

		// setup lifecycle callback handlers
		this.onUpgrade = config.onUpgrade || null
		this.onConnection = config.onConnection || null
		this.onDisconnect = config.onDisconnect || null
	}

	// map of connected clients indexed by socket id
	clients = new Clients(this)

	// utility methods for sending messages to clients
	senders = {
		/**
		 * publishes an event to a specific topic/channel
		 * @param {string} topic - the topic/channel name
		 * @param {string} event - the event name
		 * @param {any} data - the data payload to send
		 * @returns {Promise<any>} the publish result
		 * @throws {Error} when engine is not initialized
		 */
		toTopic: sendToTopic.bind(this),
		toClientId: sendToClientId.bind(this),
		toUserId: sendToUserId.bind(this),
	}

	// utility methods for finding clients
	find = {
		/**
		 * finds all clients associated with a specific user id
		 * @param {string} userId - the user id to search for
		 * @returns {Array<Client>} array of client instances for the user
		 */
		clientsByUserId: findClientsByUserId.bind(this),
	}

	/**
	 * processes incoming websocket messages from clients
	 * parses json payload, validates event format, and executes appropriate handlers
	 * @param {Object} socket - the websocket connection
	 * @param {string} payload - raw message payload
	 * @returns {Promise<void>}
	 */
	handleMessage = handleMessage.bind(this)

	/**
	 * handles new websocket connections
	 * sets up event listeners, creates client instance, and notifies connection
	 * @param {Object} socket - the new websocket connection
	 * @returns {Promise<void>}
	 */
	handleConnection = handleConnection.bind(this)

	/**
	 * handles client disconnections
	 * cleans up subscriptions, runs disconnect callbacks, and removes client
	 * @param {Object} socket - the disconnecting websocket
	 * @returns {Promise<void>}
	 */
	handleDisconnect = handleDisconnect.bind(this)

	/**
	 * handles websocket upgrade requests
	 * creates connection context, runs upgrade callbacks, and establishes connection
	 * @param {Object} req - the http request object
	 * @param {Object} res - the http response object
	 * @returns {Promise<void>}
	 */
	handleUpgrade = handleUpgrade.bind(this)

	/**
	 * registers a new event handler
	 * converts function handlers to event objects and stores them
	 * @param {string} event - the event name to register
	 * @param {Function|Object} handler - the event handler function or config object
	 * @param {Function} handler.fn - the handler function (when handler is object)
	 * @param {boolean} [handler.useMiddlewares] - whether to use middlewares
	 * @param {boolean} [handler.useContexts] - whether to use contexts
	 * @returns {void}
	 */
	registerEvent = (event, handler) => {
		// convert standalone functions to handler objects
		if (typeof handler === "function") {
			handler = { fn: handler }
		}

		// validate handler has required function property
		if (!handler.fn) {
			console.error("Event handler must have a function")
			return
		}

		// wrap handler in event class instance
		handler = new WebsocketRequestHandler(this, {
			event: event,
			fn: handler.fn,
			useMiddlewares: handler.useMiddlewares,
			useContexts: handler.useContexts,
		})

		// store event handler in registry
		this.events.set(event, handler)
	}

	/**
	 * registers multiple event handlers from an object
	 * @param {Object<string, Function|Object>} obj - object with event names as keys and handlers as values
	 * @returns {void}
	 */
	registerEvents = (obj) => {
		// iterate through event object and register each handler
		for (const [event, handler] of Object.entries(obj)) {
			this.registerEvent(event, handler)
		}
	}

	/**
	 * attaches the rtengine to a server instance
	 * sets up websocket routes and upgrade handlers
	 * @param {Object} server - the server engine instance to attach to
	 * @param {Object} server.app - the application instance with ws and upgrade methods
	 * @returns {void}
	 */
	attach = (engine) => {
		// store reference to server engine if provided
		if (typeof engine !== "undefined") {
			this.engine = engine
		}

		// setup websocket connection handler at configured path
		this.engine.app.ws(this.config.path ?? `/`, this.handleConnection)

		// setup websocket upgrade handler at configured path
		this.engine.app.upgrade(this.config.path ?? `/`, this.handleUpgrade)
	}

	/**
	 * closes the rtengine and cleans up resources
	 * currently a placeholder for future cleanup logic
	 * @returns {void}
	 */
	close = () => {}

	encode = (data) => {
		return JSON.stringify(data)
	}

	decode = (data) => {
		return JSON.parse(data)
	}
}

export default RTEngine
