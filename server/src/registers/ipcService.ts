/**
 * @fileoverview Sends service registration information over IPC
 * (process.send()) for parent-process communication.
 *
 * This module is used when the server runs as a child process managed
 * by a parent that communicates via IPC messages. It collects all
 * HTTP paths and WebSocket events and sends them as a service:register
 * message.
 *
 * Called during the server boot sequence, after routes are registered.
 */

import getRoutes from "../utils/getRoutes"
import type Server from "../server"

/**
 * Collects all registered HTTP paths and WebSocket events, filters out
 * internal routes, and sends the service metadata to the parent process
 * via process.send().
 *
 * @param server - the Linebridge server instance
 * @returns void, or null if IPC is not available
 */
export default async (server: Server): Promise<void | null> => {
	// bail if IPC mode is not enabled or process.send is unavailable
	if (!process.env.lb_service || !process.send) {
		console.error("IPC not available")
		return null
	}

	if (!server.engine) return null

	// extract all registered routes from the engine
	let { http, websocket } = getRoutes(server.engine)

	// collect unique HTTP paths (deduplicate across methods)
	let httpPaths = new Set<string>()

	for (let routes of Object.values(http)) {
		let routeList = routes.map((key) => {
			return key.path
		})

		// exclude internal built-in routes
		routeList = routeList.filter((key) => {
			if (key === "/" || key === "/_map") {
				return false
			}

			return true
		})

		routeList.forEach((key) => {
			httpPaths.add(key)
		})
	}

	const httpArr = Array.from(httpPaths)

	// filter out internal WebSocket events
	websocket = websocket.filter((key) => {
		if (
			key === "ping" ||
			key === "topic:subscribe" ||
			key === "topic:unsubscribe"
		) {
			return false
		}

		return true
	})

	// send the service registration message to the parent process
	process.send({
		type: "service:register",
		data: {
			namespace: server.params.refName,
			secure: server.hasSSL,
			http: {
				enabled: true,
				proto: server.hasSSL ? "https" : "http",
				paths: httpArr,
			},
			websocket: {
				enabled:
					typeof server.params.websockets === "object"
						? (server.params.websockets.enabled ?? false)
						: false,
				proto: server.hasSSL ? "wss" : "ws",
				path: server.params.refName ?? `/${server.params.refName}`,
				events: websocket,
			},
			listen: {
				ip: server.params.listenIp,
				port: server.params.listenPort,
			},
		},
	})
}
