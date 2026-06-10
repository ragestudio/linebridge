/**
 * @fileoverview Extracts all registered HTTP routes and WebSocket events
 * from the engine adaptor's internal registers.
 *
 * This provides a snapshot of every endpoint currently active on the server,
 * grouped by HTTP method, plus a flat list of WebSocket event names.
 */

import type { EngineAdaptor } from "../classes/EngineAdaptor"

/** shape of a route entry in the returned map */
interface RouteMap {
	path: string
}

/** shape of the result returned by this utility */
interface RoutesResult {
	http: Record<string, RouteMap[]>
	websocket: string[]
}

/**
 * Reads the engine's registers Set and builds a structured object
 * containing all HTTP route paths (grouped by method) and all
 * WebSocket event names.
 *
 * @param engine - the engine adaptor instance
 * @returns an object with http (method => paths) and websocket (event names)
 */
export default (engine: EngineAdaptor): RoutesResult => {
	const httpMap: Record<string, RouteMap[]> = {}
	const wsMap: string[] = []

	// iterate over all registered HTTP routes and group by HTTP method
	for (const { method, path } of engine.registers) {
		if (!httpMap[method]) {
			httpMap[method] = []
		}

		httpMap[method].push({
			path: path,
		})
	}

	// if the engine has a WebSocket module, collect its event names
	if (engine.ws) {
		for (const [event] of engine.ws.events.entries()) {
			wsMap.push(event)
		}
	}

	return {
		http: httpMap,
		websocket: wsMap,
	}
}
