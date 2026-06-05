/**
 * @file cluster operation: send an event to all clients subscribed to a topic
 *
 * delegates to the cluster via dispatchOperation so the service that
 * manages topic subscriptions can fan out the event to every client
 * that has called subscribe() for that topic
 */

import type NatsAdapter from "../adapter"

/**
 * broadcasts an event to all clients subscribed to the given topic
 *
 * sends a "sendToTopic" operation to the cluster. the handling service
 * looks up all socket_ids that have subscribed to the topic and
 * delivers the event to each one. this works across gateways, so
 * clients on any instance receive the message
 *
 * @param topic - the pubsub topic to broadcast to
 * @param event - the event name to send
 * @param data - optional payload to include with the event
 * @returns the decoded response from the cluster operation
 */
export default async function sendToTopic(
	this: NatsAdapter,
	topic: string,
	event: string,
	data?: any,
): Promise<any> {
	return await this.dispatchOperation("sendToTopic", {
		topic,
		event,
		data,
	})
}
