export default (middlewares, selectors, endpointRef) => {
	if (!middlewares || !selectors) {
		return []
	}

	if (typeof selectors === "string") {
		selectors = [selectors]
	}

	const execs = []

	selectors.forEach((middlewareKey) => {
		if (typeof middlewareKey === "string") {
			if (typeof middlewares[middlewareKey] !== "function") {
				throw new Error(
					`Required middleware [${middlewareKey}] not found!\n\t- Required by endpoint > ${endpointRef}\n\n`,
				)
			}

			execs.push(middlewares[middlewareKey])
		}

		if (typeof middlewareKey === "function") {
			execs.push(middlewareKey)
		}
	})

	return execs
}
