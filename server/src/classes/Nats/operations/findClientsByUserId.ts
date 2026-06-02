import synthesizeClient from "../synthesizeClient"
import type NatsAdapter from "../adapter"
import type NatsClient from "../client"

export default async function findClientsByUserId(
	this: NatsAdapter,
	user_id: string,
): Promise<NatsClient[]> {
	const sockets = await this.dispatchOperation("findClientsByUserId", {
		user_id,
	})

	if (!Array.isArray(sockets)) {
		throw new Error("Invalid response from operation. Expected an array.")
	}

	return sockets.map((client: any) => {
		return synthesizeClient(client, this)
	})
}
