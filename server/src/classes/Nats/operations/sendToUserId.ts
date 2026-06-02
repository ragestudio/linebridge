import type NatsAdapter from "../adapter"

export default async function sendToUserId(
	this: NatsAdapter,
	user_id: string,
	event: string,
	data?: any,
): Promise<any> {
	return await this.dispatchOperation("sendToUserId", {
		user_id,
		data: { event, data },
	})
}
