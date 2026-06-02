import type { MiddlewareHandlerFunction } from "../classes/Handler"

type MiddlewareRecord = Record<string, MiddlewareHandlerFunction>
type MiddlewareSelector = MiddlewareHandlerFunction[]

export default (
	middlewares: MiddlewareRecord,
	selectors: MiddlewareSelector,
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
