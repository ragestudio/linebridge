/**
 * @fileoverview Binds the uWS app to a host:port or unix socket and returns a promise
 * that resolves once the server is listening.
 *
 * Optionally registers process-exit handlers so the server auto-closes on termination.
 */

import type Engine from "./index"

/** OS signals and events that trigger an automatic server close when auto_close is enabled. */
const EXIT_EVENTS = ["exit", "SIGINT", "SIGUSR1", "SIGUSR2", "SIGTERM"]

/**
 * Starts the engine's uWS app on the configured host/port or unix socket.
 *
 * @returns A promise that resolves when the server is listening, or rejects with an error.
 */
export default async function (this: Engine): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!this.uws) {
			return reject(new Error("Engine is not initialized"))
		}

		/**
		 * Callback invoked by uWS once the server is bound (or fails to bind).
		 */
		const on_listen_socket = (listen_socket: any) => {
			if (listen_socket) {
				// store the socket handle so we can close it later
				this.listen_socket = listen_socket

				// optionally register process-exit listeners for graceful shutdown
				if (this.options.auto_close) {
					EXIT_EVENTS.forEach((type) =>
						process.once(type, () => this.close()),
					)
				}

				resolve()
			} else {
				reject(
					"Server.listen(): No Socket Received From uWebsockets.js likely due to an invalid host or busy port.",
				)
			}
		}

		// use a unix socket when socket_path is set, otherwise bind to tcp
		if (this.socket_path) {
			this.uws.listen_unix(on_listen_socket, this.socket_path)
		} else {
			this.uws.listen(this.host, this.port, on_listen_socket)
		}
	})
}
