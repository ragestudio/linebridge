import type { MiddlewareHandlerFunction } from "../classes/Handler"

export default (
	middlewares: Record<string, MiddlewareHandlerFunction>,
	selectors: Array<MiddlewareHandlerFunction | string>,
): MiddlewareHandlerFunction[] => {
	if (!middlewares || !selectors) {
		return []
	}

	if (typeof selectors === "string") {
		selectors = [selectors]
	}

	const execs: MiddlewareHandlerFunction[] = []

	selectors.forEach((middlewareKey) => {
		let item!: MiddlewareHandlerFunction

		if (typeof middlewareKey === "string") {
			item = middlewares[middlewareKey]
		}

		if (typeof middlewareKey === "function") {
			item = middlewareKey
		}

		if (!item) {
			throw new Error(
				`Failed to find required middleware [${middlewareKey}]`,
			)
		}

		execs.push(item)
	})

	return execs
}
