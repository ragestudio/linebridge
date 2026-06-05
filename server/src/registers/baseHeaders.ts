/**
 * @fileoverview Injects default HTTP headers into the server engine.
 *
 * Merges headers defined by the server instance with built-in defaults
 * (from Vars.baseHeaders) and applies them as key/value entries so the
 * engine sends them on every HTTP response.
 *
 * Called during the server boot sequence.
 */

import Vars from "../vars"
import type Server from "../server"

/**
 * Merges server-level headers with built-in defaults and assigns them
 * to the engine so they are included in every HTTP response.
 *
 * @param server - the Linebridge server instance
 * @returns null if the server or engine is not available, otherwise void
 */
export default (server: Server): void | null => {
	if (!server || !server.engine) {
		return null
	}

	// merge server-defined headers with the framework defaults
	server.engine.base_headers = {
		...server.headers,
		...Vars.baseHeaders,
	}
}
