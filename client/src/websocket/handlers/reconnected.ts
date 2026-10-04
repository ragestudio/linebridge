import type RTEClient from ".."

/**
 * Handles the 'reconnected' event.
 *
 * @param {Object} data - Reconnection data.
 */
export default function (this: RTEClient, data: any) {
	this.topics.regenerate()
}
