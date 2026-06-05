/**
 * Writes values from focus object onto base object.
 *
 * @param {any} original Base Object
 * @param {any} target Focus Object
 */
function wrap_object(original, target) {
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
function array_buffer_to_string(array_buffer, encoding = "utf8") {
	return Buffer.from(array_buffer).toString(encoding)
}

/**
 * Returns a promise which is resolved after provided delay in milliseconds.
 *
 * @param {Number} delay
 * @returns {Promise<void>}
 */
function async_wait(delay) {
	return new Promise((resolve, reject) =>
		setTimeout((res) => res(), delay, resolve),
	)
}

export { array_buffer_to_string, wrap_object, async_wait }
