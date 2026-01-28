export default async function (topic, event, data) {
	if (this.nats && typeof this.nats.operations?.sendToTopic === "function") {
		return await this.nats.operations.sendToTopic(topic, event, data)
	}

	// ensure engine is properly initialized
	if (!this.engine) {
		throw new Error("Engine not initialized")
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
