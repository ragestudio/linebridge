import * as Serializers from "../serializers"
const { headers } = require("@nats-io/transport-node")
import type NatsAdapter from "../adapter"

export default async function sendToClientID(
	this: NatsAdapter,
	client_id: string,
	event: string,
	data?: any,
): Promise<void> {
	const clientHeaders = headers()

	clientHeaders.append("socket_id", client_id)

	await this.nats.publish(
		"ipc",
		Buffer.from(Serializers.EventData({ event, data })),
		{ headers: clientHeaders },
	)
}
