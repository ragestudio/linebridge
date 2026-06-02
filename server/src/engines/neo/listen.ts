import type Engine from "./index"

const EXIT_EVENTS = ["exit", "SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM"]

export default async function (this: Engine): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!this.uws) {
			return reject(new Error("Engine is not initialized"))
		}

		const on_listen_socket = (listen_socket: any) => {
			if (listen_socket) {
				this.listen_socket = listen_socket

				if (this.options.auto_close) {
					EXIT_EVENTS.forEach((type) =>
						process.once(type, () => this.close()),
					)
				}

				resolve()
			} else {
				reject(
					"HyperExpress.Server.listen(): No Socket Received From uWebsockets.js likely due to an invalid host or busy port.",
				)
			}
		}

		if (this.socket_path) {
			this.uws.listen_unix(on_listen_socket, this.socket_path)
		} else {
			this.uws.listen(this.host, this.port, on_listen_socket)
		}
	})
}
