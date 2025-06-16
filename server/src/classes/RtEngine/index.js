import Client from "./client"
import BuiltInEvents from "./events"

class RTEngineNG {
	constructor(config = {}) {
		this.config = config
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
				const result = await handler(client, message.data, {
					senders: this.senders,
					find: this.find,
				})

				if (message.ack === true) {
					client.emit(`ack_${message.event}`, result)
				}
			} else {
				console.log(`[ws] 404 /${message.event}`)
				client.error("Event handler not found")
			}
		} catch (error) {
			if (!(error instanceof OperationError)) {
				console.log(`[ws] 500 /${message?.event ?? "unknown"} >`, error)
			}

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

		await client.emit("connected", {
			id: client.id,
			authenticated: client.authenticated,
		})

		this.clients.set(socket.context.id, client)
	}

	handleDisconnect = async (socket) => {
		const client = this.clients.get(socket.context.id)

		// fire onDisconnect function handler
		try {
			if (typeof this.onDisconnect === "function") {
				await this.onDisconnect(socket, client)
			}
		} catch (error) {
			console.error("Error handling disconnect >", error)
		}

		// delete from all unsubscribed channels
		try {
			if (client) {
				await client.unsubscribeAll()
			}
		} catch (error) {
			console.error("Error unsubscribing client topics >", error)
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

	attach = (engine) => {
		this.engine = engine

		this.engine.app.ws(this.config.path ?? `/`, this.handleConnection)
		this.engine.app.upgrade(this.config.path ?? `/`, this.handleUpgrade)
	}

	close = () => {
		// nothing to do, yet...
	}
}

export default RTEngineNG
