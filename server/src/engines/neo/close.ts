/**
 * @fileoverview Gracefully shuts down the uWS app: closes the WebSocket server
 * and closes the TCP/unix listen socket.
 */

import uWebsockets from "uWebSockets.js"
import type Engine from "."

/**
 * Closes the WebSocket server (if any) and the uWS listen socket.
 *
 * @returns `true` if the socket was closed, `false` if there was nothing to close.
 */
export default async function (this: Engine): Promise<boolean> {
	if (!this.listen_socket) {
		return false
	}

	// close the WebSocket server so no new connections are accepted
	if (this.ws && typeof this.ws?.close === "function") {
		this.ws.close()
	}

	// close the underlying uWS listen socket and clear the reference
	uWebsockets.us_listen_socket_close(this.listen_socket)
	this.listen_socket = null

	return true
}
