/**
 * @file cluster operation: send an event to a specific client by socket id
 *
 * when the owning node is known the event is published on
 * "downstream.<node>" so only that gateway wakes up. without a node id the
 * event falls back to the broadcast "ipc" subject, which every gateway
 * receives and filters by socket_id.
 */

import type NatsAdapter from "../adapter"
import * as Serializers from "../serializers"
import { nats } from "../../../lazyNats"

/**
 * delivers an event directly to a specific client across the cluster
 *
 * @param client_id - the socket_id of the target client
 * @param event - the event name to send
 * @param data - optional payload to include with the event
 * @param node_id - gateway node that owns the socket, when known
 */
export default async function sendToClientID(
	this: NatsAdapter,
	client_id: string,
	event: string,
	data?: any,
	node_id?: string,
): Promise<void> {
	if (!this.connection) {
		throw new Error("NATS connection not initialized")
	}

	// build headers that route the message to the target socket
	const clientHeaders = nats!.headers()

	clientHeaders.append("socket_id", client_id)

	if (node_id) {
		clientHeaders.append("node_id", node_id)
	}

	const subject = node_id ? `downstream.${node_id}` : "ipc"

	this.connection.publish(
		subject,
		Buffer.from(Serializers.EventData({ event, data })),
		{ headers: clientHeaders },
	)
}
