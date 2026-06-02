import type NatsAdapter from "../adapter"

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
