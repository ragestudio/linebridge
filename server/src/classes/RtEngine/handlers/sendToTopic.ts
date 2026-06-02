import type RTEngine from "../index"

export default async function sendToTopic(
	this: RTEngine,
	topic: string,
	event: string,
	data?: any,
) {
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToTopic === "function"
	) {
		return await this.server.nats.operations.sendToTopic(topic, event, data)
	}

	return this.engine.app.publish(topic, this.encode({ topic, event, data }))
}
