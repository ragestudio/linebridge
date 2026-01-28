import * as Serializers from "../serializers"
import { headers } from "nats"

export default async function (client_id, event, data) {
	const clientHeaders = headers()

	clientHeaders.append("socket_id", client_id)

	return await this.nats.publish(
		`ipc`,
		Buffer.from(
			Serializers.EventData({
				event: event,
				data: data,
				error: error,
			}),
		),
		{
			headers: clientHeaders,
		},
	)
}
