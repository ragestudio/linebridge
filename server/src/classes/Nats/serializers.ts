/**
 * @file fast json serializers for NATS message payloads
 *
 * uses fast-json-stringify to pre-compile json schemas into
 * optimized serialization functions, reducing per-message overhead
 * on the hot path of the NATS publish/subscribe pipeline
 */

const fastJSON = require("fast-json-stringify")

/**
 * serializer for socket event messages pushed over the "ipc" subject
 *
 * events flow from the gateway to the client (or vice versa) carrying
 * an event name, optional data, optional error, and an ack flag that
 * signals whether the sender expects a reply
 */
export const EventData = fastJSON({
	type: "object",
	properties: {
		event: { type: "string" },
		data: {},
		error: {},
		ack: { type: "boolean" },
	},
	required: ["event"],
})

/**
 * serializer for operation request payloads sent to the "operations" subject
 *
 * each request carries a type string that identifies the operation
 * (e.g. "sendToTopic", "findClientsByUserId") and a free-form data field
 */
export const Operation = fastJSON({
	type: "object",
	properties: {
		type: { type: "string" },
		data: {},
	},
	required: ["type"],
})

/**
 * serializer for operation response payloads
 *
 * mirrors the OperationResult interface: an ok boolean plus optional
 * data or error fields returned by the handling service
 */
export const OpResult = fastJSON({
	type: "object",
	properties: {
		ok: { type: "boolean" },
		data: {},
		error: {},
	},
	required: ["ok"],
})
