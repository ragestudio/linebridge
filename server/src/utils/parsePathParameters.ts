/**
 * @fileoverview Parses a route pattern string (e.g. "/users/:id/posts/:postId")
 * and extracts the positional path parameters.
 *
 * Each parameter is returned as a tuple of [name, positionIndex], where
 * positionIndex is the 0-based order of the parameter within the path.
 *
 * Example:
 *   Input:  "/users/:id/posts/:postId"
 *   Output: [["id", 0], ["postId", 1]]
 */

/**
 * Splits a route pattern by "/", identifies segments that start with ":",
 * and returns an array of [parameterName, index] pairs.
 *
 * @param pattern - the route path pattern to parse
 * @returns an array of [key, index] tuples for each parameter found
 */
export default (pattern: string) => {
	let results = []
	let counter = 0

	// only parse if there are colon-prefixed segments
	if (pattern.indexOf("/:") > -1) {
		let chunks = pattern.split("/").filter((chunk) => chunk.length > 0)

		for (let index = 0; index < chunks.length; index++) {
			let current = chunks[index]

			// a parameter is a segment starting with ":" and at least 2 chars long
			if (current.startsWith(":") && current.length >= 2) {
				// strip the ":" prefix, record the name and its positional index
				results.push([current.substring(1), counter])
				counter++
			}
		}
	}

	return results
}
