import synthesizeClient from "../synthesizeClient"

export default async function (user_id) {
	const socketIds = await this.dispatchOperation("findClientsByUserId", {
		user_id: user_id,
	})

	return socketIds.map((client) => {
		return synthesizeClient(client, this)
	})
}
