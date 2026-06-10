/**
 * @fileoverview Resolves and registers global middlewares on the server engine.
 *
 * Merges middlewares defined by the server instance with built-in defaults
 * (from Vars.baseMiddlewares), then resolves the requested middleware keys/names
 * into actual handler functions and registers them via the engine.
 *
 * Called during the server boot sequence.
 */

import composeMiddlewares from "../utils/composeMiddlewares"
import Vars from "../vars"
import type Server from "../server"

/**
 * Composes all available middlewares, selects the ones requested by the
 * server params, and registers each selected middleware with the engine.
 *
 * @param server - the Linebridge server instance
 */
export default async (server: Server): Promise<void> => {
	// merge server-specific and built-in middleware maps, then resolve
	// the selectors (names or functions) into actual middleware functions
	const middlewares = composeMiddlewares(
		{ ...server.middlewares, ...Vars.baseMiddlewares },
		server.params.useMiddlewares,
	)

	// register each resolved middleware with the engine so it runs globally
	middlewares.forEach((middleware) => {
		server.engine.register_middleware(middleware)
	})
}
