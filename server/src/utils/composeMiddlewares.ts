/**
 * @fileoverview Resolves middleware selectors (keys/names or function references)
 * into an ordered array of actual middleware handler functions.
 *
 * Middlewares can be referenced by string key (looked up from the global
 * middlewares map) or passed directly as function references. This utility
 * resolves both cases and ensures every requested middleware exists,
 * throwing an error if one is missing.
 */

import type { MiddlewareHandlerFunction } from "../classes/Handler"

/**
 * Takes a map of available middlewares and a list of selectors, and returns
 * an array of resolved middleware functions in the same order as the selectors.
 *
 * @param middlewares - map of middleware keys to handler functions
 * @param selectors   - ordered list of middleware names (strings) or
 *                      direct function references to resolve
 * @returns an array of resolved middleware handler functions
 * @throws {Error} if a named middleware is not found in the map
 */
export default (
	middlewares: Record<string, MiddlewareHandlerFunction>,
	selectors: Array<MiddlewareHandlerFunction | string>,
): MiddlewareHandlerFunction[] => {
	// return empty if there's nothing to resolve
	if (!middlewares || !selectors) {
		return []
	}

	// normalize: if a single string is passed, wrap it in an array
	if (typeof selectors === "string") {
		selectors = [selectors]
	}

	const execs: MiddlewareHandlerFunction[] = []

	selectors.forEach((middlewareKey) => {
		let item!: MiddlewareHandlerFunction

		// resolve by name from the middlewares map
		if (typeof middlewareKey === "string") {
			item = middlewares[middlewareKey]
		}

		// use the function reference directly
		if (typeof middlewareKey === "function") {
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
