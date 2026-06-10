/**
 * @fileoverview Sets wildcard CORS headers on the server so that
 * cross-origin requests from any domain are allowed.
 *
 * This is intended for development convenience or public APIs that
 * need to accept requests from any origin. In production you may
 * want to restrict these values.
 *
 * Called during the server boot sequence.
 */

import type Server from "../server"

/**
 * Adds permissive CORS headers to the server's headers object.
 * Allows any origin, any method, any header, and includes credentials.
 *
 * @param server - the Linebridge server instance
 */
export default (server: Server): void => {
	server.headers["Access-Control-Allow-Origin"] = "*"
	server.headers["Access-Control-Allow-Methods"] = "*"
	server.headers["Access-Control-Allow-Headers"] = "*"
	server.headers["Access-Control-Allow-Credentials"] = "true"
}
