export default async function (user_id, event, data) {
	return await this.dispatchOperation("sendToUserId", {
		user_id: user_id,
		data: {
			event: event,
			data: data,
		},
	})
}
