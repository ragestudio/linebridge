/**
 * Writes values from focus object onto base object.
 *
 */
function wrap_object(original: any, target: any) {
	Object.keys(target).forEach((key) => {
		if (typeof target[key] == "object") {
			if (Array.isArray(target[key])) return (original[key] = target[key]) // lgtm [js/prototype-pollution-utility]

			if (original[key] === null || typeof original[key] !== "object") {
				original[key] = {}
			}

			wrap_object(original[key], target[key])
		} else {
			original[key] = target[key]
		}
	})
}

/**
 * This method converts ArrayBuffers to a string.
 *
 * @param {ArrayBuffer} array_buffer
 * @param {BufferEncoding} encoding
 * @returns {String} String
 */
function array_buffer_to_string(array_buffer: ArrayBuffer, encoding: BufferEncoding = "utf8") {
	return Buffer.from(array_buffer).toString(encoding)
}

export { array_buffer_to_string, wrap_object }
