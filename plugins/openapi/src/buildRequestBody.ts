import { addSchemaRef } from "./addSchemaRef"

export function buildRequestBody(spec: any, refs: Map<string, any>) {
	if (!spec.body) {
		return undefined
	}

	let refName = null

	if (typeof spec.body.ref === "object") {
		addSchemaRef(refs, spec.body.ref)
		refName = spec.body.ref.name
	} else {
		refName = spec.body.ref.toString()
	}

	return {
		description: spec.body.description,
		content: {
			"application/json": {
				schema: {
					type: spec.body.type,
					$ref: `#/components/schemas/${refName}`,
				},
			},
		},
	}
}

export default buildRequestBody
