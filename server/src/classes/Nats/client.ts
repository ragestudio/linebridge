import * as Serializers from "./serializers"
import type { NatsClientContext } from "./types"

export default class NatsClient {
	engine: any
	nats: any
	headers: any
	codec: any
	context: NatsClientContext

	constructor({
		engine,
		nats,
		headers,
		codec,
	}: {
		engine: any
		nats: any
		headers: any
		codec: any
	}) {
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
			this.context.user = JSON.parse(headers.get("user")!)
		}
	}

	get id(): string {
		return this.context.socket_id
	}

	get userId(): string | undefined {
		return this.context.userId
	}

	get user(): Record<string, any> {
		if (this.context.user) {
			return this.context.user
		}

		return {
			_id: this.context.userId,
			username: this.context.username,
			avatar: this.context.avatar,
		}
	}

	get authenticated(): boolean {
		return !!this.context.token && !!this.context.userId
	}

	async emit(
		event: string,
		data?: any,
		error?: any,
		ack?: boolean,
	): Promise<void> {
		await this.nats.publish(
			"ipc",
			Buffer.from(Serializers.EventData({ event, data, error, ack })),
			{ headers: this.headers },
		)
	}

	async error(error: any): Promise<void> {
		await this.emit("error", null, error, false)
	}

	async ack(event: string, data?: any, error?: any): Promise<void> {
		if (typeof event !== "string") {
			throw new TypeError("event must be a string")
		}

		await this.emit(event, data, error, true)
	}

	async subscribe(topic: string): Promise<any> {
		const response = await this.operation("subscribeToTopic", { topic })

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		return await this.emit("topic:subscribed", topic)
	}

	async unsubscribe(topic: string): Promise<any> {
		const response = await this.operation("unsubscribeToTopic", { topic })

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		return await this.emit("topic:unsubscribed", topic)
	}

	async toTopic(
		topic: string,
		event: string,
		data?: any,
		self: boolean = false,
	): Promise<any> {
		const response = await this.operation("sendToTopic", {
			topic,
			event,
			data,
		})

		if (!response) return null
		if (!response.ok) return await this.error(response.error)

		if (self === true) {
			await this.emit(event, data)
		}
	}

	async operation(type: string, data?: any): Promise<any> {
		try {
			const response = await this.nats.request(
				"operations",
				Buffer.from(Serializers.Operation({ type, data })),
				{ headers: this.headers, timeout: 50000 },
			)

			const decoded = this.codec.decode(response.data)

			if (!decoded.ok) {
				return await this.error(decoded.error)
			}

			return decoded
		} catch (error) {
			console.error(error)
			return null
		}
	}
}
