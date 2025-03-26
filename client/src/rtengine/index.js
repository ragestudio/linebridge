import TopicsController from "./topics"

export class RTEngineClient {
	constructor(params = {}) {
		this.params = {
			maxConnectRetries: 3,
			...params,
		}
	}

	state = {
		id: null,
		connected: false,
	}

	socket = null

	handlers = new Set()

	topics = new TopicsController(this)

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

	async disconnect() {
		if (!this.socket) {
			return false
		}

		this.topics.unsubscribeAll()
		this.socket.close()
		this.socket = null
	}

	on = (event, handler) => {
		this.handlers.add({
			event,
			handler,
		})
	}

	off = (event, handler) => {
		this.handlers.delete({
			event,
			handler,
		})
	}

	once = (event, handler) => {
		this.handlers.add({
			event,
			handler,
			once: true,
		})
	}

	emit = async (event, data) => {
		if (!this.socket) {
			throw new Error("Failed to send, socket not connected")
		}

		return await this.socket.send(JSON.stringify({ event, data }))
	}

	#_decode(payload) {
		return JSON.parse(payload)
	}

	//* HANDLERS
	#handleMessage(event) {
		try {
			const payload = this.#_decode(event.data)

			if (typeof payload.event !== "string") {
				throw new Error("Invalid event or payload")
			}

			return this.#dispatchToHandlers(payload.event, payload.data)
		} catch (error) {
			console.error("Error handling message:", error)
		}
	}

	#handleClose() {
		this.state.connected = false
		this.#dispatchToHandlers("disconnect")
	}

	#handleOpen() {
		this.state.connected = true
		this.#dispatchToHandlers("connect")
	}

	#handleError(error) {
		console.error("WebSocket connection error:", error)
		this.#dispatchToHandlers("error")
	}

	baseHandlers = {
		connected: (data) => {
			this.state.connected = true

			if (data.id) {
				this.state.id = data.id
			}
		},
		error: (error) => {
			console.error(error)
		},
	}

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
