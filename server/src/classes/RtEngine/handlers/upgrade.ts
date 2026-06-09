/**
 * Upgrade handler for the RTEngine subsystem.
 *
 * Called by uWebSockets.js when an HTTP request matches the WebSocket path.
 * Creates a context with a unique id and the token from the query string,
 * runs the user-provided onUpgrade hook (if set) for authentication, and
 * upgrades the HTTP connection to a WebSocket.
 *
 * @module RtEngine/handlers/upgrade
 */

import nanoid from "../../../utils/nanoid"
import type RTEngine from "../index"

/**
 * Handles the HTTP-to-WebSocket upgrade handshake.
 *
 * Steps:
 * 1. Builds a context object with a unique id, token, and HTTP headers
 * 2. If an onUpgrade hook is configured, calls it (hook must call res.upgrade)
 * 3. Otherwise, immediately upgrades the connection
 * 4. On error, responds with HTTP 401 and closes
 *
 * @param this - The RTEngine instance (bound via .bind(this))
 * @param req  - The uWebSockets.js HTTP request object
 * @param res  - The uWebSockets.js HTTP response object
 */
export default async function upgrade(this: RTEngine, req: any, res: any) {
	try {
		const context = {
			id: nanoid(),
			token: req.query.token,
			user: null,
			httpHeaders: req.headers,
		}

		if (typeof this.onUpgrade === "function") {
			await this.onUpgrade(context, req.query.token, res)
		} else {
			res.upgrade(context)
		}
	} catch (error) {
		console.error("Error upgrading connection:", error)
		res.status(401).end()
	}
}
