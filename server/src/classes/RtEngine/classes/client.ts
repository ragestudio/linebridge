import type RTEngine from "../index"
import type { RtEngineSocket } from "../types"

export class Client {
	engine: RTEngine
	socket: RtEngineSocket
	id: string
	context: RtEngineSocket["context"]
	userId: string | null
	authenticated: boolean

	constructor(engine: RTEngine, socket: RtEngineSocket) {
		this.engine = engine
		this.socket = socket

		this.id = socket.context.id
		this.context = socket.context

		this.userId = socket.context.user?._id || null
		this.authenticated = !!socket.context.session
	}

	async emit(
		event: string,
		data?: any,
		error?: any,
		ack?: boolean,
	): Promise<any> {
		return this.socket.send(
			this.engine.encode({
				event,
				data,
				error,
				ack,
			}),
		)
	}

	async toTopic(
		topic: string,
		event: string,
		data?: any,
		self: boolean = false,
	): Promise<any> {
		const payload = this.engine.encode({ topic, event, data })
		this.socket.publish(topic, payload)

		if (self === true) {
			return this.emit(event, data)
		}
	}

	async error(error: Error | string): Promise<void> {
		if (error instanceof Error) {
			error = error.toString()
		}

		this.emit("error", null, error)
	}

	async ack(eventKey: string, data?: any, error?: any): Promise<any> {
		if (typeof eventKey !== "string") {
			throw new TypeError("eventKey must be a string")
		}

		return this.emit(eventKey, data, error, true)
	}

	async subscribe(topic: string): Promise<any> {
		this.socket.subscribe(topic)
		return this.emit("topic:subscribed", topic)
	}

	async unsubscribe(topic: string): Promise<any> {
		this.socket.unsubscribe(topic)
		return this.emit("topic:unsubscribed", topic)
	}

	async unsubscribeAll(): Promise<void> {
		for (const topic of this.socket.topics) {
			await this.unsubscribe(topic)
		}
	}

	async operation(_type: string, _data?: any): Promise<any> {
		return null
	}
}

export default Client
