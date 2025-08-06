import Client from "./client"
import BuiltInEvents from "./events"
import { WebsocketRequestHandler } from "../Handler"

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
	clients = new Map()

	// utility methods for sending messages to clients
	senders = {
		/**
		 * sends an event to all connected clients
		 * @param {string} event - the event name to broadcast
		 * @param {any} data - the data payload to send
		 * @returns {Promise<void>}
		 */
		broadcast: async (event, data) => {
			// iterate through all connected clients
			for (const [socketId, client] of this.clients) {
				// send the event to each client
				client.emit(event, data)
			}
		},
		/**
		 * publishes an event to a specific topic/channel
		 * @param {string} topic - the topic/channel name
		 * @param {string} event - the event name
		 * @param {any} data - the data payload to send
		 * @returns {Promise<any>} the publish result
		 * @throws {Error} when engine is not initialized
		 */
		toTopic: async (topic, event, data) => {
			// ensure engine is properly initialized
			if (!this.engine) {
				throw new Error("Engine not initialized")
			}

			// publish message to topic with structured payload
			return this.engine.app.publish(
				topic,
				this.encode({
					topic: topic,
					event: event,
					data: data,
				}),
			)
		},
	}

	// utility methods for finding clients
	find = {
		/**
		 * finds all clients associated with a specific user id
		 * @param {string} userId - the user id to search for
		 * @returns {Array<Client>} array of client instances for the user
		 */
		clientsByUserId: (userId) => {
			// initialize array to store matching clients
			const clients = []

			// search through all connected clients
			for (const [socketId, client] of this.clients) {
				// check if client belongs to the requested user
				if (client.userId === userId) {
					clients.push(client)
				}
			}

			return clients
		},
	}

	/**
	 * processes incoming websocket messages from clients
	 * parses json payload, validates event format, and executes appropriate handlers
	 * @param {Object} socket - the websocket connection
	 * @param {string} payload - raw message payload
	 * @returns {Promise<void>}
	 */
	handleMessage = async (socket, payload) => {
		// retrieve client instance from socket context
		const client = this.clients.get(socket.context.id)

		// ensure client exists in our registry
		if (!client) {
			return socket.send(
				this.encode({ event: "error", data: "Client not found" }),
			)
		}

		try {
			// parse incoming json payload
			payload = this.decode(payload)

			// validate event field is a string
			if (typeof payload.event !== "string") {
				return client.error("Invalid event type")
			}

			// lookup event handler in registry
			const handler = this.events.get(payload.event)

			if (!(handler instanceof WebsocketRequestHandler)) {
				throw new OperationError(
					500,
					"Cannot find the handler for this event",
				)
			}

			// execute event handler
			return await handler.execute(client, payload)
		} catch (error) {
			// log unexpected errors (skip operation errors)
			if (!(error instanceof OperationError)) {
				console.log(`[ws] 500 /${payload?.event ?? "unknown"} >`, error)
			}

			// send error acknowledgment if requested
			// else send generic global error to client
			if (payload?.ack === true && payload?.event) {
				client.socket.send(
					this.encode({
						event: `ack_${payload.event}`,
						error: error.message,
					}),
				)
			} else {
				client.error(error)
			}
		}
	}

	/**
	 * handles new websocket connections
	 * sets up event listeners, creates client instance, and notifies connection
	 * @param {Object} socket - the new websocket connection
	 * @returns {Promise<void>}
	 */
	handleConnection = async (socket) => {
		// run custom connection callback if provided
		if (this.onConnection) {
			await this.onConnection(socket)
		}

		// setup socket event listeners
		socket.on("message", (payload) => this.handleMessage(socket, payload))
		socket.on("close", () => this.handleDisconnect(socket))

		// create new client instance for this connection
		const client = new Client(this, socket)

		// notify client of successful connection
		await client.emit("connected", {
			id: client.id,
			authenticated: client.authenticated,
		})

		// register client in our clients map
		this.clients.set(socket.context.id, client)
	}

	/**
	 * handles client disconnections
	 * cleans up subscriptions, runs disconnect callbacks, and removes client
	 * @param {Object} socket - the disconnecting websocket
	 * @returns {Promise<void>}
	 */
	handleDisconnect = async (socket) => {
		// retrieve client instance before cleanup
		const client = this.clients.get(socket.context.id)

		// execute custom disconnect callback if provided
		try {
			if (typeof this.onDisconnect === "function") {
				await this.onDisconnect(socket, client)
			}
		} catch (error) {
			console.error("Error handling disconnect >", error)
		}

		// cleanup client subscriptions to prevent memory leaks
		try {
			if (client) {
				await client.unsubscribeAll()
			}
		} catch (error) {
			console.error("Error unsubscribing client topics >", error)
		}

		// remove client from active connections registry
		this.clients.delete(socket.context.id)
	}

	/**
	 * handles websocket upgrade requests
	 * creates connection context, runs upgrade callbacks, and establishes connection
	 * @param {Object} req - the http request object
	 * @param {Object} res - the http response object
	 * @returns {Promise<void>}
	 */
	handleUpgrade = async (req, res) => {
		try {
			// create connection context with unique id and request data
			const context = {
				id: nanoid(),
				token: req.query.token,
				user: null,
				httpHeaders: req.headers,
			}

			// run custom upgrade handler if provided, otherwise upgrade directly
			if (typeof this.onUpgrade === "function") {
				await this.onUpgrade(context, req.query.token, res)
			} else {
				res.upgrade(context)
			}
		} catch (error) {
			// log upgrade errors and reject connection
			console.error("Error upgrading connection:", error)
			res.status(401).end()
		}
	}

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
	 * @param {Object} engine - the server engine instance to attach to
	 * @param {Object} engine.app - the application instance with ws and upgrade methods
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
