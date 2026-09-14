import { addSchemaRef } from "./addSchemaRef"

export function buildResponses(spec: any, refs: Map<string, any>) {
	const responses: Record<string, any> = {
		default: { description: "Default response" },
	}

	if (spec.returns) {
		let schemaData: any = {}

		if (spec.returns.ref) {
			let refName = null
			if (typeof spec.returns.ref === "object") {
				addSchemaRef(refs, spec.returns.ref)
				refName = spec.returns.ref.name
			} else {
				refName = spec.returns.ref.toString()
			}
			schemaData = {
				type: spec.returns.type,
				$ref: `#/components/schemas/${refName}`,
			}
		} else {
			schemaData = {
				type: spec.returns.type,
				properties: spec.returns.properties,
				items: spec.returns.items,
			}
		}

		responses[200] = {
			description: spec.returns.description || "Success response",
			content: {
				"application/json": {
					schema: schemaData,
				},
			},
		}
	}

	if (spec.errors) {
		for (const [code, err] of Object.entries<any>(spec.errors)) {
			responses[code] = { description: err.description }
		}
	}

	return responses
}

export default buildResponses
