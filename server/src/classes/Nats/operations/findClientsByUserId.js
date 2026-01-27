import synthesizeClient from "../synthesizeClient"

export default async function (user_id) {
	const sockets = await this.dispatchOperation("findClientsByUserId", {
		user_id: user_id,
	})

	if (!Array.isArray(sockets)) {
		throw new Error("Invalid response from operation. Expected an array.")
	}

	return sockets.map((client) => {
		return synthesizeClient(client, this)
	})
}
