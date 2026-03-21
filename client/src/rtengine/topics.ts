import type RTEngineClient from "./index.ts"

/**
 * Controller for managing topic subscriptions in a real-time client.
 * Allows subscribing, unsubscribing, and listening to events associated with specific topics.
 */
class TopicsController {
	/**
	 * Creates an instance of the TopicsController.
	 *
	 * @param {RTEngineClient} client - RTE client that will handle communications.
	 */
	constructor(client: RTEngineClient) {
		this.client = client
	}

	client: RTEngineClient

	/**
	 * Set that stores the topics currently subscribed to.
	 * @type {Set<string>}
	 */
	subscribed: Set<string> = new Set()
	subscriptionsRefs: Map<
		string,
		{
			fromEvent: string
			subscribed: boolean
			timeout?: number
		}
	> = new Map()

	/**
	 * Subscribes to a specific topic.
	 *
	 * @param {string} topic - The topic to subscribe to.
	 * @returns {Promise<boolean>} - Promise that resolves to true when the subscription is complete.
	 */
	subscribe = async (
		subscriberEventName: string,
		topic: any,
	): Promise<boolean> => {
		console.log(
			`[rt/${this.client.params.refName}] Subscribing to topic:`,
			topic,
		)

		// create a subscription reference for this topic
		this.subscriptionsRefs.set(topic, {
			fromEvent: subscriberEventName,
			subscribed: false,
		})

		// send a subscription request to the server
		this.client.emit(subscriberEventName, topic)

		return true
	}

	/**
	 * Unsubscribes from a specific topic.
	 *
	 * @param {string} unsubscribeEventName - The event name to use for unsubscribing.
	 * @param {string} topic - The topic to unsubscribe from.
	 * @returns {Promise<boolean>} - Promise that resolves to true when the unsubscription is complete.
	 */
	unsubscribe = async (
		unsubscribeEventName: string,
		topic: string,
	): Promise<boolean> => {
		console.log(
			`[rt/${this.client.params.refName}] Unsubscribing from topic:`,
			topic,
		)

		this.client.emit(unsubscribeEventName, topic)

		return true
	}

	/**
	 * Unsubscribes from all currently subscribed topics.
	 *
	 * @returns {Promise<boolean>} - Promise that resolves to true when all unsubscriptions are complete.
	 */
	unsubscribeAll = async (): Promise<boolean> => {
		// for (const topic of this.subscribed) {
		// 	await this.unsubscribe(topic)
		// }

		this.client.emit("topic:unsubscribe:all")

		return true
	}

	/**
	 * Registers a callback for a specific event on a given topic.
	 *
	 * @param {string} topic - The topic to associate the event with.
	 * @param {string} event - Name of the event to listen for.
	 * @param {Function} callback - Function to execute when the event occurs on the specified topic.
	 * @param {*} callback.data - Data received from the event.
	 * @param {Object} callback.payload - Complete event payload, includes topic information.
	 */
	on = (topic: string, event: string, callback: Function) => {
		this.client.on(event, (data: any, payload: any) => {
			if (payload?.topic === topic) {
				callback(data, payload)
			}
		})
	}

	off = (topic: string, event: string, callback: Function) => {
		this.client.off(event, (data: any, payload: any) => {
			if (payload?.topic === topic) {
				callback(data, payload)
			}
		})
	}

	/**
	 * Regenerates all current subscriptions by unsubscribing and resubscribing.
	 * Useful for updating connections or refreshing the subscription state.
	 *
	 * @returns {Promise<boolean>} - Promise that resolves to true when regeneration is complete.
	 */

	// TODO: this is not gonna work, some topic subscriptions needs to be triggered on a specific
	// event channel intead using "topic:subscribe".
	//
	// This can be approached from the backend (using a session regeneration system),
	// or rewriting this topic management logic, to store subscribed events properly (instead only storing the topic name)
	regenerate = async (): Promise<boolean> => {
		console.log(
			`[rt/${this.client.params.refName}] Regenerating topics...`,
			this.subscribed,
		)

		for (const [topic, ref] of this.subscriptionsRefs.entries()) {
			this.client.emit(ref.fromEvent, topic)
		}

		return true
	}
}

export default TopicsController
