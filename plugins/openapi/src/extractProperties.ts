import { typeMap } from "."

export function extractProperties(properties: Record<string, any>) {
	return Object.entries(properties).reduce(
		(acc, [key, value]) => {
			let type = value.type?.name
				? value.type.name.toLowerCase()
				: value.type

			if (type === "array" || type === Array) {
				acc[key] = { type: "array", items: { type: "string" } }
			} else {
				acc[key] = typeMap[type] || { type }
			}

			return acc
		},
		{} as Record<string, any>,
	)
}

export default extractProperties
