import type RTEClient from ".."

export default function (this: RTEClient, topic: string) {
	console.log(`[rt/${this.params.refName}] topic unsubscribed:`, topic)

	this.topics.subscribed.delete(topic)

	if (this.topics.subscriptionsRefs.has(topic)) {
		this.topics.subscriptionsRefs.delete(topic)
	}
}
