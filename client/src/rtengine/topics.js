/**
 * Controller for managing topic subscriptions in a real-time client.
 * Allows subscribing, unsubscribing, and listening to events associated with specific topics.
 */
class TopicsController {
	/**
	 * Creates an instance of the TopicsController.
	 *
	 * @param {Object} client - Real-time client that will handle communications.
	 */
	constructor(client) {
		this.client = client
	}

	/**
	 * Set that stores the topics currently subscribed to.
	 * @type {Set<string>}
	 */
	subscribed = new Set()

	/**
	 * Registers a callback for a specific event on a given topic.
	 *
	 * @param {string} topic - The topic to associate the event with.
	 * @param {string} event - Name of the event to listen for.
	 * @param {Function} callback - Function to execute when the event occurs on the specified topic.
	 * @param {*} callback.data - Data received from the event.
	 * @param {Object} callback.payload - Complete event payload, includes topic information.
	 */
	on = (topic, event, callback) => {
		this.client.on(event, (data, payload) => {
			if (payload.topic === topic) {
				callback(data, payload)
			}
		})
	}

	/**
	 * Subscribes to a specific topic.
	 *
	 * @param {string} topic - The topic to subscribe to.
	 * @returns {Promise<boolean>} - Promise that resolves to true when the subscription is complete.
	 */
	subscribe = async (subscriberEventName, topic) => {
		console.log(
			`[rt/${this.client.params.refName}] Subscribing to topic:`,
			topic,
		)

		return await this.client.emit(subscriberEventName, topic)
	}

	/**
	 * Unsubscribes from a specific topic.
	 *
	 * @param {string} topic - The topic to unsubscribe from.
	 * @returns {Promise<boolean>} - Promise that resolves to true when the unsubscription is complete.
	 */
	unsubscribe = async (topic) => {
		console.log(
			`[rt/${this.client.params.refName}] Unsubscribing from topic:`,
			topic,
		)

		return await this.client.emit("topic:unsubscribe", topic)
	}

	/**
	 * Unsubscribes from all currently subscribed topics.
	 *
	 * @returns {Promise<boolean>} - Promise that resolves to true when all unsubscriptions are complete.
	 */
	unsubscribeAll = async () => {
		for (const topic of this.subscribed) {
			await this.unsubscribe(topic)
		}

		return true
	}

	/**
	 * Regenerates all current subscriptions by unsubscribing and resubscribing.
	 * Useful for updating connections or refreshing the subscription state.
	 *
	 * @returns {Promise<boolean>} - Promise that resolves to true when regeneration is complete.
	 */
	regenerate = async () => {
		console.log(
			`[rt/${this.client.params.refName}] Regenerating topics...`,
			this.subscribed,
		)

		for (const topic of this.subscribed.values()) {
			await this.client.emit("topic:unsubscribe", topic)
			await this.client.emit("topic:subscribe", topic)
		}

		return true
	}
}

export default TopicsController
