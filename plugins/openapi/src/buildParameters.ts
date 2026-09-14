export function buildParameters(spec: any) {
	const params = []

	if (spec.parameters) {
		for (const [key, value] of Object.entries<any>(spec.parameters)) {
			params.push({
				name: key,
				in: "path",
				required: true,
				description: value.description,
				schema: { type: value.type },
			})
		}
	}

	if (spec.query) {
		for (const [key, value] of Object.entries<any>(spec.query)) {
			params.push({
				name: key,
				in: "query",
				required: value.required,
				description: value.description,
				schema: { type: value.type },
			})
		}
	}

	return params
}

export default buildParameters
