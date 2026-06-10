/**
 * Handles the 'reconnected' event.
 *
 * @param {Object} data - Reconnection data.
 */
export default function (this: any, data: any) {
	this.topics.regenerate()
}
