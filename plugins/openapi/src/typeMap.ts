export const typeMap: Record<string, any> = {
	string: { type: "string" },
	number: { type: "number" },
	boolean: { type: "boolean" },
	date: { type: "string", format: "date-time" },
	String: { type: "string" },
	Number: { type: "number" },
	Boolean: { type: "boolean" },
	Date: { type: "string", format: "date-time" },
}

export default typeMap
