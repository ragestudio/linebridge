import type RTEClient from ".."

/**
 * Handles the 'connected' event.
 */
export default function (this: RTEClient, data: any) {
	if (data && data.id) {
		this.state.id = data.id
		this.state.authenticated = data.authenticated
	}
}
