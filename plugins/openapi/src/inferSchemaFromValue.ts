export function inferSchemaFromValue(value: any): any {
	if (value === null) {
		return { type: "null" }
	}

	if (Array.isArray(value)) {
		return {
			type: "array",
			items:
				value.length > 0
					? inferSchemaFromValue(value[0])
					: { type: "object" },
		}
	}

	const type = typeof value

	if (type === "object") {
		const properties: Record<string, any> = {}

		for (const key in value) {
			properties[key] = inferSchemaFromValue(value[key])
		}

		return {
			type: "object",
			properties,
			description: "Auto-inferred response",
		}
	}

	return { type }
}

export default inferSchemaFromValue
