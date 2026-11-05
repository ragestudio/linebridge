/**
 * @file sends an operation request to the cluster via NATS
 *
 * three delivery modes are supported:
 *
 * - "deliver": publish to the broadcast subject, every gateway handles the
 *   operation for its local clients and no reply is awaited. used by fan-out
 *   operations like sendToUserId and sendToTopic.
 * - "direct": request to "operations.<node>", only the gateway that owns the
 *   socket answers. used by operations bound to a single connection.
 * - "broadcast": request to "operations", any gateway may answer. kept for
 *   operations that still need the old behavior.
 */

import * as Serializers from "../serializers"
import type NatsAdapter from "../adapter"

export type DispatchMode = "deliver" | "direct" | "broadcast"

export type DispatchOptions = {
	/** target node for the "direct" mode */
	nodeId?: string
	/** delivery mode, defaults to "broadcast" */
	mode?: DispatchMode
}

/**
 * how long a cluster operation may take, generous enough for a hop between
 * datacenters. override with LB_OPERATIONS_TIMEOUT in milliseconds.
 */
export function operationsTimeout(): number {
	return Number(process.env.LB_OPERATIONS_TIMEOUT) || 5000
}

/**
 * dispatches a named operation to the cluster
 *
 * in "deliver" mode the payload is published on the broadcast subject and
 * undefined is returned. in request modes the decoded data field is returned
 * and a failed response throws.
 *
 * @param operation - the operation name (e.g. "findClientsByUserId")
 * @param data - optional payload to pass to the operation handler
 * @param options - delivery mode and target node
 */
export default async function dispatchOperation(
	this: NatsAdapter,
	operation: string,
	data?: any,
	options: DispatchOptions = {},
): Promise<any> {
	if (!this.connection) {
		throw new Error("NATS connection not initialized")
	}

	const mode = options.mode ?? "broadcast"
	const payload = Buffer.from(
		Serializers.Operation({ type: operation, data }),
	)

	// fan-out: every gateway handles its local clients, no reply is expected
	if (mode === "deliver") {
		this.connection.publish("operations", payload)

		return undefined
	}

	// directed requests go only to the node that owns the socket, and fall
	// back to the broadcast subject when the node is unknown
	const subject =
		mode === "direct" && options.nodeId
			? `operations.${options.nodeId}`
			: "operations"

	const response = await this.connection.request(subject, payload, {
		timeout: operationsTimeout(),
	})

	const decoded = this.codec.decode(response.data) as any

	if (!decoded.ok) {
		throw new Error(decoded.error)
	}

	return decoded.data
}
