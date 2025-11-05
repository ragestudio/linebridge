export default class NatsClient {
	constructor({ engine, nats, headers, codec }) {
		this.engine = engine
		this.nats = nats
		this.headers = headers
		this.codec = codec

		this.context = {
			id: headers.get("socket_id"),
			socket_id: headers.get("socket_id"),
			token: headers.get("token"),
			user_id: headers.get("user_id"),
			userId: headers.get("user_id"),
			username: headers.get("username"),
		}

		if (headers.get("user")) {
			this.context.user = JSON.parse(headers.get("user"))
		}
	}

	get id() {
		return this.context.socket_id
	}

	get userId() {
		return this.context.userId
	}

	get user() {
		if (this.context.user) {
			return this.context.user
		}

		return {
			_id: this.context.userId,
			username: this.context.username,
			avatar: this.context.avatar,
		}
	}

	get autenticated() {
		return !!this.context.token && !!this.context.userId
	}

	emit = async (event, data, error) => {
		return await this.nats.publish(
			`downstream`,
			this.codec.encode({
				event: event,
				data: data,
				error: error,
			}),
			{
				headers: this.headers,
			},
		)
	}

	error = async (error) => {
		return await this.nats.publish(
			`downstream`,
			this.codec.encode({
				event: "error",
				data: null,
				error: error,
			}),
			{
				headers: this.headers,
			},
		)
	}

	toTopic = async (topic, event, data, self = false) => {
		const response = await this.nats.request(
			`operations`,
			this.codec.encode({
				type: "sendToTopic",
				data: {
					topic: topic,
					event: event,
					data: data,
				},
			}),
			{
				headers: this.headers,
			},
		)

		if (!response.ok) {
			return await this.error(response.error)
		}

		if (self === true) {
			await this.emit(event, data)
		}
	}

	subscribe = async (topic) => {
		const response = await this.operation("subscribeToTopic", {
			topic: topic,
		})

		if (!response.ok) {
			return await this.error(response.error)
		}

		return await this.emit("topic:subscribed", topic)
	}

	unsubscribe = async (topic) => {
		const response = await this.operation("unsubscribeToTopic", {
			topic: topic,
		})

		if (!response.ok) {
			return await this.error(response.error)
		}

		return await this.emit("topic:unsubscribed", topic)
	}

	operation = async (type, data) => {
		let response = await this.nats.request(
			`operations`,
			this.codec.encode({
				type: type,
				data: data,
			}),
			{
				headers: this.headers,
			},
		)

		response = await this.codec.decode(response.data)

		return response
	}
}
