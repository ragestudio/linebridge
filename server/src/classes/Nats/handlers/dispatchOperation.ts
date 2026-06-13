/**
 * @file sends an operation request to another service via NATS
 *
 * publishes a request to the "operations" subject and waits for a
 * response. used by the local adapter to invoke operations exposed
 * by other services in the cluster (findClientsByUserId, sendToTopic, etc.)
 */

import * as Serializers from "../serializers"
import type NatsAdapter from "../adapter"

/**
 * dispatches a named operation to the cluster and returns the result
 *
 * serializes the operation type and data into a NATS request on the
 * "operations" subject. the service that handles the request looks up
 * the operation in its operations map, executes it, and replies with
 * an OpResult payload. this method decodes the reply and returns the
 * data on success, or throws on failure.
 *
 * @param operation - the operation name (e.g. "findClientsByUserId")
 * @param data - optional payload to pass to the operation handler
 * @returns the decoded data field from the operation response
 * @throws {Error} if the response indicates failure (ok: false)
 */
export default async function dispatchOperation(
	this: NatsAdapter,
	operation: string,
	data?: any,
): Promise<any> {
	if (!this.nats) {
		throw new Error("NATS connection not initialized")
	}

	const response = await this.nats.request(
		"operations",
		Buffer.from(Serializers.Operation({ type: operation, data })),
	)

	const decoded = this.codec.decode(response.data) as any

	if (!decoded.ok) {
		throw new Error(decoded.error)
	}

	return decoded.data
}
