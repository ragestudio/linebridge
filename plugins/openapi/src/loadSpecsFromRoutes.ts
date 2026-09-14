import fs from "node:fs"
import inferSchemaFromValue from "./inferSchemaFromValue"

export async function loadSpecsFromRoutes(registers: Set<any>) {
	let specifications = new Set<any>()

	for (const endpoint of registers) {
		let spec: any = {
			path: endpoint.path,
			method: endpoint.method === "any" ? "get" : endpoint.method,
			description: `Auto-generated route for ${endpoint.path}`,
		}

		if (endpoint._source_file) {
			const specFilePath = endpoint._source_file.replace(
				/\.(js|ts)$/,
				".spec.$1",
			)

			if (fs.existsSync(specFilePath)) {
				try {
					const specModule = await import(specFilePath)
					const specification =
						specModule.specification || specModule.default

					if (specification) {
						const methodSpec =
							specification[endpoint.method.toLowerCase()] ??
							specification

						spec = { ...spec, ...methodSpec }
					}
				} catch (error) {
					// Ignored
				}
			}
		}

		const pathParamsMatch = [...endpoint.path.matchAll(/:([a-zA-Z0-9_]+)/g)]

		if (pathParamsMatch.length > 0 && !spec.parameters) {
			spec.parameters = {}

			for (const match of pathParamsMatch) {
				spec.parameters[match[1]] = {
					type: "string",
					description: `Path parameter ${match[1]}`,
				}
			}
		}

		if (endpoint.handler && typeof endpoint.handler.fn === "function") {
			const originalFn = endpoint.handler.fn
			endpoint.handler.fn = async (...args: any[]) => {
				const result = await originalFn(...args)

				if (
					result &&
					(!spec.returns ||
						(spec.returns.type === "object" &&
							Object.keys(spec.returns.properties || {})
								.length === 0))
				) {
					spec.returns = inferSchemaFromValue(result)
				}

				return result
			}
		}

		specifications.add(spec)
	}

	return specifications
}

export default loadSpecsFromRoutes
