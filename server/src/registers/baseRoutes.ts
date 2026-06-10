/**
 * @fileoverview Registers the built-in base routes of the Linebridge server.
 *
 * These routes are always available regardless of user-defined routes:
 *  - "/"      returns server metadata (name, version, engine, etc.)
 *  - "/_map"  returns a map of all registered HTTP and WebSocket routes
 *
 * Called during the server boot sequence (server.run()) before user routes.
 */

import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"
import type Server from "../server"
import type { Route } from "../classes/Route"

import MainBaseRoute from "../baseRoutes/main"
import MapBaseRoute from "../baseRoutes/map"

// ordered list of built-in route classes
const base_routes = [MainBaseRoute, MapBaseRoute]

/**
 * Iterates over the built-in route classes and registers each one
 * with the server's engine so they become active endpoints.
 *
 * @param server - the Linebridge server instance
 */
export default async (server: Server): Promise<void> => {
	for await (const route of base_routes) {
		// instantiate the route class and register it with the engine
		server.engine.register(new (route as typeof Route<Server>)())
	}
}
