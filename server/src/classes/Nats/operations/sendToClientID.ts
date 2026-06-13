/**
 * @file cluster operation: send an event to a specific client by socket id
 *
 * builds NATS headers targeting a particular socket and publishes
 * an event on the "ipc" subject. the gateway that owns that socket
 * receives the message and delivers it to the physical connection
 */

import * as Serializers from "../serializers"
import { headers } from "@nats-io/transport-node"
import type NatsAdapter from "../adapter"

/**
 * delivers an event directly to a specific client across the cluster
 *
 * constructs fresh headers with the target socket_id, serializes the
 * event and optional data via the EventData serializer, and publishes
 * to the "ipc" subject. the owning gateway picks up the message and
 * forwards it to the correct websocket connection
 *
 * @param client_id - the socket_id of the target client
 * @param event - the event name to send
 * @param data - optional payload to include with the event
 */
export default async function sendToClientID(
	this: NatsAdapter,
	client_id: string,
	event: string,
	data?: any,
): Promise<void> {
	if (!this.connection) {
		throw new Error("NATS connection not initialized")
	}

	if (!this.jetstream) {
		throw new Error("JetStream not initialized")
	}

	// build headers that route the message to the target socket
	const clientHeaders = headers()

	clientHeaders.append("socket_id", client_id)

	// publish directly to the ipc subject with routing headers
	await this.jetstream.publish(
		"ipc",
		Buffer.from(Serializers.EventData({ event, data })),
		{ headers: clientHeaders },
	)
}
