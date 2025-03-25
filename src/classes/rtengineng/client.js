class Client {
	constructor(socket) {
		this.socket = socket
		this.id = socket.context.id

		this.userId = socket.context.user?._id || null
		this.authed = !!socket.context.session
	}

	emit(event, data) {
		const payload = JSON.stringify({ event, data })

		return this.socket.send(payload)
	}

	toTopic(topic, event, data, self = false) {
		const payload = JSON.stringify({
			topic,
			event,
			data,
		})

		this.socket.publish(topic, payload)

		if (self === true) {
			this.emit(event, data)
		}
	}

	error(error) {
		if (error instanceof Error) {
			error = error.toString()
		}

		return this.emit("error", error)
	}

	subscribe(topic) {
		return this.socket.subscribe(topic)
	}

	unsubscribe(topic) {
		return this.socket.unsubscribe(topic)
	}
}

export default Client
