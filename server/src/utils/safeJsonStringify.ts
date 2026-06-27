/**
 * returns a JSON.stringify replacer that detects and replaces circular references
 *
 * uses a WeakSet to track visited objects. when a circular reference is
 * detected, the value is replaced with the string "[Circular]" so the
 * serialization can complete without throwing
 */
function getCircularReplacer(): (key: string, value: any) => any {
	const seen = new WeakSet<object>()

	return (key: string, value: any): any => {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) {
				return "[Circular]"
			}

			seen.add(value)
		}

		return value
	}
}

/**
 * safe JSON stringify that handles circular references gracefully
 *
 * falls back to a replacer-based approach if the direct stringify throws,
 * ensuring the serialization never crashes on circular structures
 */
export default function safeJsonStringify(data: any): string {
	try {
		return JSON.stringify(data)
	} catch {
		return JSON.stringify(data, getCircularReplacer())
	}
}
