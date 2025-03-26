class TopicsController {
	constructor(client) {
		this.client = client
	}

	subscribed = new Set()

	subscribe = async (topic) => {
		await this.client.emit("topic:subscribe", topic)
		this.subscribed.add(topic)

		return true
	}

	unsubscribe = async (topic) => {
		await this.client.emit("topic:unsubscribe", topic)
		this.subscribed.delete(topic)

		return true
	}

	unsubscribeAll = async () => {
		for (const topic of this.subscribed) {
			await this.leave(topic)
		}

		return true
	}
}

export default TopicsController
