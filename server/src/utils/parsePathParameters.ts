/**
 * This method parses route pattern into an array of expected path parameters.
 *
 * @param {String} pattern
 * @returns {Array} [[key {String}, index {Number}], ...]
 */
export default (pattern: string) => {
	let results = []
	let counter = 0

	if (pattern.indexOf("/:") > -1) {
		let chunks = pattern.split("/").filter((chunk) => chunk.length > 0)

		for (let index = 0; index < chunks.length; index++) {
			let current = chunks[index]

			if (current.startsWith(":") && current.length > 2) {
				results.push([current.substring(1), counter])
				counter++
			}
		}
	}

	return results
}
