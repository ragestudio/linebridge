import { buildParameters } from "./buildParameters"
import { buildRequestBody } from "./buildRequestBody"
import { buildResponses } from "./buildResponses"

export async function generateOpenAPIJson(specifications: Set<any>) {
	const paths: Record<string, any> = {}
	const components: { schemas: Record<string, any> } = { schemas: {} }
	const refs = new Map<string, any>()

	for (const spec of specifications) {
		const path = spec.path.replace(/:([^/]+)/g, `{$1}`)

		if (!paths[path]) {
			paths[path] = {}
		}

		const parameters = buildParameters(spec)
		const requestBody = buildRequestBody(spec, refs)
		const responses = buildResponses(spec, refs)

		paths[path][spec.method] = {
			description: spec.description,
			parameters,
			...(requestBody && { requestBody }),
			responses,
		}
	}

	for (const [name, ref] of refs) {
		components.schemas[name] = {
			type: ref.type,
			properties: ref.properties,
			...(ref.required && ref.required.length > 0
				? { required: ref.required }
				: {}),
		}
	}

	return {
		openapi: "3.0.0",
		info: {
			title: "api",
			version: "1.0.0",
		},
		paths,
		components,
	}
}

export default generateOpenAPIJson
