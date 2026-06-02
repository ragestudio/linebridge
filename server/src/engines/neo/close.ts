import uWebsockets from "uWebSockets.js"
import type Engine from "."

export default async function (this: Engine): Promise<boolean> {
	if (!this.listen_socket) {
		return false
	}

	if (this.ws && typeof this.ws?.close === "function") {
		this.ws.close()
	}

	uWebsockets.us_listen_socket_close(this.listen_socket)
	this.listen_socket = null

	return true
}
