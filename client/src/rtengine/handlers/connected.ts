/**
 * Handles the 'connected' event.
 *
 * @param {Object} data - Connection data from server.
 */
export default function (this: any, data: any) {
	if (data && data.id) {
		this.state.id = data.id
		this.state.authenticated = data.authenticated
	}
}
