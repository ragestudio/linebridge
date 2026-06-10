/**
 * @fileoverview Defines the "/" (root) built-in route for the Linebridge server.
 *
 * Responds to GET requests at the root path with server metadata including
 * the service name (refName), version, engine type, Linebridge library version,
 * experimental status, and the request timestamp.
 */

import Route from "../classes/Route"
import Vars from "../vars"

import type Server from "../server"
import { HttpHandlerFunction } from "../classes/Handler"

/**
 * Built-in route handler for GET /.
 *
 * Returns JSON with the server's identity and version information,
 * useful for health checks, discovery, and debugging.
 */
export default class MainRoute extends Route<Server> {
	path = "/"

	// request the server context so we can access server metadata
	useContexts = ["server"] as const

	handler: HttpHandlerFunction = async (req, res, ctx) => {
		return {
			name: ctx.server.params.refName ?? "unknown",
			version: Vars.projectPkg.version,
			engine: ctx.server.params.useEngine ?? "unknown",
			lb_version: Vars.libPkg.version ?? "unknown",
			experimental: ctx.server.experimental ?? "unknown",
			request_time: new Date().getTime(),
		}
	}
}
