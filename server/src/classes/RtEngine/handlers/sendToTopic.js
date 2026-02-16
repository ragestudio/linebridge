export default async function (topic, event, data) {
	if (!this.engine) {
		throw new Error("Engine not initialized")
	}

	if (
		this.server.nats &&
		typeof this.server.nats.operations?.sendToTopic === "function"
	) {
		return await this.server.nats.operations.sendToTopic(topic, event, data)
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
}
