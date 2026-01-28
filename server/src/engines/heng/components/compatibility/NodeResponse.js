/**
 * @typedef {Object} NodeResponseTypes
 * @property {number} statusCode
 * @property {string} statusMessage
 */
export default class NodeResponse {
	/* Properties */
	get statusCode() {
		return this._status_code
	}

	set statusCode(value) {
		this._status_code = value
	}

	get statusMessage() {
		return this._status_message
	}

	set statusMessage(value) {
		this._status_message = value
	}
}
