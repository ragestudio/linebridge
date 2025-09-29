export default async function (topic, event, data) {
	return await this.dispatchOperation("sendToTopic", {
		topic: topic,
		event: event,
		data: data,
	})
}
