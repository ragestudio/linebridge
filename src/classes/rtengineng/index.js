import HyperExpress from "hyper-express"

import Client from "./client"
import BuiltInEvents from "./events"

class RTEngineNG {
	constructor(config = {}) {
		this.events = new Map()

		if (typeof config.events === "object") {
			for (const [event, handler] of Object.entries(config.events)) {
				this.events.set(event, handler)
			}
		}

		for (const [event, handler] of Object.entries(BuiltInEvents)) {
			this.events.set(event, handler)
		}

		this.onUpgrade = config.onUpgrade || null
		this.onConnection = config.onConnection || null
		this.onDisconnect = config.onDisconnect || null
	}

	clients = new Map()

	router = new HyperExpress.Router()

	senders = {
		broadcast: async (event, data) => {
			for (const [socketId, client] of this.clients) {
				client.emit(event, data)
			}
		},
		toTopic: async (topic, event, data) => {
			if (!this.engine) {
				throw new Error("Engine not initialized")
			}

			return this.engine.app.publish(
				topic,
				JSON.stringify({
					topic: topic,
					event: event,
					data: data,
				}),
			)
		},
	}

	find = {
		clientsByUserId: (userId) => {
			const clients = []

			for (const [socketId, client] of this.clients) {
				if (client.userId === userId) {
					clients.push(client)
				}
			}

			return clients
		},
	}

	handleMessage = async (socket, payload) => {
		const client = this.clients.get(socket.context.id)

		if (!client) {
			return socket.send(
				JSON.stringify({ event: "error", data: "Client not found" }),
			)
		}

		let message = null

		try {
			message = JSON.parse(payload)

			if (typeof message.event !== "string") {
				return client.error("Invalid event type")
			}

			const handler = this.events.get(message.event)

			if (typeof handler === "function") {
				await handler(client, message.data)
			} else {
				console.log(`[ws] 404 /${message.event}`)
				client.error("Event handler not found")
			}
		} catch (error) {
			console.log(`[ws] 500 /${message?.event ?? "unknown"} >`, error)
			client.error(error)
		}
	}

	handleConnection = async (socket) => {
		if (this.onConnection) {
			await this.onConnection(socket)
		}

		socket.on("message", (payload) => this.handleMessage(socket, payload))
		socket.on("close", () => this.handleDisconnect(socket))

		const client = new Client(socket)

		this.clients.set(socket.context.id, client)
	}

	handleDisconnect = async (socket) => {
		if (typeof this.onDisconnect === "function") {
			await this.onDisconnect(socket)
		}

		this.clients.delete(socket.context.id)
	}

	handleUpgrade = async (req, res) => {
		try {
			const context = {
				id: nanoid(),
				token: req.query.token,
				user: null,
				httpHeaders: req.headers,
			}

			if (typeof this.onUpgrade === "function") {
				await this.onUpgrade(context, req.query.token, res)
			} else {
				res.upgrade(context)
			}
		} catch (error) {
			console.error("Error upgrading connection:", error)
			res.status(401).end()
		}
	}

	registerEvent = (event, handler) => {
		this.events.set(event, handler)
	}

	registerEvents = (obj) => {
		for (const [event, handler] of Object.entries(obj)) {
			this.registerEvent(event, handler)
		}
	}

	attach = async (engine) => {
		this.engine = engine

		this.router.ws("/", this.handleConnection)
		this.router.upgrade("/", this.handleUpgrade)

		this.engine.app.use("/", this.router)
	}

	close = () => {
		// nothing to do, yet...
	}
}

export default RTEngineNG
