export function extractRequiredKeys(properties: Record<string, any>) {
	return Object.keys(properties).filter((key) => properties[key].required)
}

export default extractRequiredKeys
