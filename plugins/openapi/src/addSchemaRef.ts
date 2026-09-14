import { extractProperties } from "./extractProperties"
import { extractRequiredKeys } from "./extractRequiredKeys"

export function addSchemaRef(refs: Map<string, any>, ref: any) {
	// Basic validation and check if already added
	// Removed !ref.constructor check as it prevents Mongoose models (which are constructors)
	if (!ref || !ref.name || refs.has(ref.name)) {
		return // Return nothing as original didn't use return value
	}

	let schemaName
	let schemaType
	let rawProperties

	// Check if it's a Mongoose model (simple check for .schema property and .name)
	// Mongoose models typically have a 'schema' property and a 'name' property
	if (ref.schema && ref.name) {
		schemaName = ref.name
		schemaType = "object" // Mongoose models represent objects
		rawProperties = ref.schema.obj // Get the raw schema object structure
	} else {
		// Assume it's a standard specification ref object
		// It must have type and properties
		if (!ref.type || !ref.properties) {
			console.warn(
				`[OpenAPIPlugin] Invalid schema ref definition for ${ref.name}. Missing 'type' or 'properties'.`,
			)
			return
		}

		schemaName = ref.name
		schemaType = ref.type
		rawProperties = ref.properties
	}

	// Extract required keys and process properties for OpenAPI format
	const required = extractRequiredKeys(rawProperties)
	const properties = extractProperties(rawProperties)

	// Store the processed schema definition in the refs map
	refs.set(schemaName, { type: schemaType, required, properties })
}

export default addSchemaRef
