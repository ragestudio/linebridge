const fastJSON = require("fast-json-stringify")

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

export const Operation = fastJSON({
	type: "object",
	properties: {
		type: { type: "string" },
		data: {},
	},
	required: ["type"],
})

export const OpResult = fastJSON({
	type: "object",
	properties: {
		ok: { type: "boolean" },
		data: {},
		error: {},
	},
	required: ["ok"],
})
