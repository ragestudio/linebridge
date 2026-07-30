import type RTEClient from ".."

/**
 * Handles topic subscribed events.
 */
export default function (this: RTEClient, topic: string) {
	console.log(`[rt/${this.params.refName}] topic subscribed:`, topic)

	this.topics.subscribed.add(topic)

	const subscriptionRef = this.topics.subscriptionsRefs.get(topic)

	if (subscriptionRef) {
		// Clear any existing timeout for the subscription
		if (subscriptionRef.timeout) {
			clearTimeout(subscriptionRef.timeout)
		}

		// Mark the subscription as subscribed
		subscriptionRef.subscribed = true

		// Update the subscription reference in the map
		this.topics.subscriptionsRefs.set(topic, subscriptionRef)
	}
}
