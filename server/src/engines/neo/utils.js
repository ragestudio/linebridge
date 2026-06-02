/**
 * Writes values from focus object onto base object.
 *
 * @param {Object} obj1 Base Object
 * @param {Object} obj2 Focus Object
 */
function wrap_object(original, target) {
	Object.keys(target).forEach((key) => {
		if (typeof target[key] == "object") {
			if (Array.isArray(target[key])) return (original[key] = target[key]) // lgtm [js/prototype-pollution-utility]
			if (original[key] === null || typeof original[key] !== "object")
				original[key] = {}
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
 * @param {String} encoding
 * @returns {String} String
 */
function array_buffer_to_string(array_buffer, encoding = "utf8") {
	return Buffer.from(array_buffer).toString(encoding)
}

/**
 * Copies an ArrayBuffer to a Uint8Array.
 * Note! This method is supposed to be extremely performant as it is used by the Body parser.
 * @param {ArrayBuffer} array_buffer
 */
function copy_array_buffer_to_uint8array(array_buffer) {
	return Buffer.from(array_buffer)
}

/**
 * Returns a promise which is resolved after provided delay in milliseconds.
 *
 * @param {Number} delay
 * @returns {Promise}
 */
function async_wait(delay) {
	return new Promise((resolve, reject) =>
		setTimeout((res) => res(), delay, resolve),
	)
}

/**
 * Merges provided relative paths into a singular relative path.
 *
 * @param {String} base_path
 * @param {String} new_path
 * @returns {String} path
 */
function merge_relative_paths(base_path, new_path) {
	// handle both roots merger case
	if (base_path == "/" && new_path == "/") return "/"

	// Inject leading slash to new_path
	if (!new_path.startsWith("/")) new_path = "/" + new_path

	// handle base root merger case
	if (base_path == "/") return new_path

	// handle new path root merger case
	if (new_path == "/") return base_path

	// strip away leading slash from base path
	if (base_path.endsWith("/"))
		base_path = base_path.substr(0, base_path.length - 1)

	// Merge path and add a slash in between if new_path does not have a starting slash
	return `${base_path}${new_path}`
}

/**
 * Returns all property descriptors of an Object including extended prototypes.
 *
 * @param {Object} prototype
 */
function get_all_property_descriptors(prototype) {
	// Retrieve initial property descriptors
	const descriptors = Object.getOwnPropertyDescriptors(prototype)

	// Determine if we have a parent prototype with a custom name
	const parent = Object.getPrototypeOf(prototype)
	if (parent && parent.constructor.name !== "Object") {
		// Merge and return property descriptors along with parent prototype
		return Object.assign(descriptors, get_all_property_descriptors(parent))
	}

	// Return property descriptors
	return descriptors
}

/**
 * Converts Windows path backslashes to forward slashes.
 * @param {string} string
 * @returns {string}
 */
function to_forward_slashes(string) {
	return string.split("\\").join("/")
}

module.exports = {
	array_buffer_to_string,
	wrap_object,
	async_wait,
	merge_relative_paths,
	to_forward_slashes,
	copy_array_buffer_to_uint8array,
}
