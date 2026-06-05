/**
 * @fileoverview Defines the "/_map" built-in route for the Linebridge server.
 *
 * Responds to GET requests at /_map with a structured map of all registered
 * HTTP routes (grouped by method) and WebSocket event names currently
 * active on the server's engine.
 */

import Route from "../classes/Route"
import getRoutes from "../utils/getRoutes"

import type Server from "../server"
import type { HttpHandlerFunction } from "../classes/Handler/http"

/**
 * Built-in route handler for GET /_map.
 *
 * Returns a JSON object describing every endpoint registered on the server:
 * HTTP routes grouped by their method, and a flat list of WebSocket event names.
 * This is useful for introspection, debugging, and API documentation.
 */
export default class MapRoute extends Route<Server> {
	path = "/_map"

	handler: HttpHandlerFunction = async (req, res) => {
		return getRoutes(this.server.engine)
	}
}
