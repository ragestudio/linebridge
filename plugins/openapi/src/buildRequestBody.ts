import { addSchemaRef } from "./addSchemaRef"

export function buildRequestBody(spec: any, refs: Map<string, any>) {
	if (!spec.body) {
		return undefined
	}

	let schemaData: any = {}

	if (spec.body.ref) {
		let refName = null

		if (typeof spec.body.ref === "object") {
			addSchemaRef(refs, spec.body.ref)
			refName = spec.body.ref.name
		} else {
			refName = spec.body.ref.toString()
		}

		schemaData = {
			type: spec.body.type,
			$ref: `#/components/schemas/${refName}`,
		}
	} else {
		schemaData = {
			type: spec.body.type,
			properties: spec.body.properties,
			items: spec.body.items,
			...(spec.body.required ? { required: spec.body.required } : {}),
		}
	}

	return {
		description: spec.body.description,
		content: {
			"application/json": {
				schema: schemaData,
			},
		},
	}
}

export default buildRequestBody
