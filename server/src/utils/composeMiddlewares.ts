/**
 * @fileoverview Resolves middleware selectors (keys/names or function references)
 * into an ordered array of actual middleware handler functions.
 *
 * Middlewares can be referenced by string key (looked up from the global
 * middlewares map) or passed directly as function references. This utility
 * resolves both cases and ensures every requested middleware exists,
 * throwing an error if one is missing.
 */

import type {
	MiddlewareHandlerFunction,
	MiddlewareObj,
} from "../classes/Handler/middleware"

/**
 * Takes a map of available middlewares and a list of selectors, and returns
 * an array of resolved middleware functions in the same order as the selectors.
 *
 * @param middlewares - map of middleware keys to handler functions or middleware objects
 * @param selectors   - ordered list of middleware names (strings) or
 *                      direct function references to resolve
 * @returns an array of resolved middleware handler functions
 * @throws {Error} if a named middleware is not found in the map
 */
export default (
	middlewares: Record<
		string,
		MiddlewareHandlerFunction | MiddlewareObj<any, any, any>
	>,
	selectors: Array<
		MiddlewareHandlerFunction | MiddlewareObj<any, any, any> | string
	>,
): Array<MiddlewareHandlerFunction | MiddlewareObj<any, any, any>> => {
	// return empty if there's nothing to resolve
	if (!middlewares || !selectors) {
		return []
	}

	// normalize: if a single string is passed, wrap it in an array
	if (typeof selectors === "string") {
		selectors = [selectors]
	}

	const execs: Array<
		MiddlewareHandlerFunction | MiddlewareObj<any, any, any>
	> = []

	selectors.forEach((middlewareKey) => {
		let item!: MiddlewareHandlerFunction | MiddlewareObj<any, any, any>

		// resolve by name from the middlewares map
		if (typeof middlewareKey === "string") {
			const resolved = middlewares[middlewareKey]
			item = resolved as any
		}

		// use the function/object reference directly
		if (
			typeof middlewareKey === "function" ||
			typeof middlewareKey === "object"
		) {
			item = middlewareKey
		}

		// if resolution failed, report the error immediately
		if (!item) {
			throw new Error(
				`Failed to find required middleware [${middlewareKey}]`,
			)
		}

		execs.push(item)
	})

	return execs
}
