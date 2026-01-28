import * as Serializers from "./serializers"

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

	async emit(event, data, error, ack) {
		return await this.nats.publish(
			`ipc`,
			Buffer.from(
				Serializers.EventData({
					event: event,
					data: data,
					error: error,
					ack: ack,
				}),
			),
			{
				headers: this.headers,
			},
		)
	}

	async error(error) {
		this.emit("error", null, error, false)
	}

	async ack(event, data, error) {
		if (typeof event !== "string") {
			throw new TypeError("event must be a string")
		}

		await this.emit(event, data, error, true)
	}

	async subscribe(topic) {
		const response = await this.operation("subscribeToTopic", {
			topic: topic,
		})

		if (!response) {
			return null
		}

		if (!response.ok) {
			return await this.error(response.error)
		}

		return await this.emit("topic:subscribed", topic)
	}

	async unsubscribe(topic) {
		const response = await this.operation("unsubscribeToTopic", {
			topic: topic,
		})

		if (!response) {
			return null
		}

		if (!response.ok) {
			return await this.error(response.error)
		}

		return await this.emit("topic:unsubscribed", topic)
	}

	async toTopic(topic, event, data, self = false) {
		const response = await this.operation("sendToTopic", {
			topic: topic,
			event: event,
			data: data,
		})

		if (!response) {
			return null
		}

		if (!response.ok) {
			return await this.error(response.error)
		}

		if (self === true) {
			await this.emit(event, data)
		}
	}

	async operation(type, data) {
		try {
			let response = await this.nats.request(
				`operations`,
				Buffer.from(
					Serializers.Operation({
						type: type,
						data: data,
					}),
				),
				{
					headers: this.headers,
				},
			)

			response = await this.codec.decode(response.data)

			if (!response.ok) {
				return await this.error(response.error)
			}

			return response
		} catch (error) {
			console.error(error)
			return null
		}
	}
}
