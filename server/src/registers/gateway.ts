/**
 * @fileoverview Sends service registration information to the Linebridge Gateway
 * over a Unix socket.
 *
 * This module connects to the gateway socket (specified by the LB_GATEWAY_SOCKET
 * env variable) and sends a JSON message describing the service's HTTP routes,
 * WebSocket events, listening address/port, and namespace.
 *
 * Called during the server boot sequence, after routes and ws events are registered.
 */

import net from "node:net"
import getRoutes from "../utils/getRoutes"
import type Server from "../server"

/**
 * Collects all HTTP paths and WebSocket events registered on the engine,
 * filters out internal routes, and sends the service metadata to the
 * Linebridge Gateway via a Unix socket connection.
 *
 * @param server - the Linebridge server instance
 * @returns void, or null if the gateway socket is not configured
 */
export default async (server: Server): Promise<void | null> => {
	if (!process.env.LB_GATEWAY_SOCKET) {
		console.error("LB_GATEWAY_SOCKET not available")
		return null
	}

	if (!server.engine) return null

	// extract all registered HTTP and WebSocket routes from the engine
	let { http, websocket } = getRoutes(server.engine)

	// collect unique HTTP paths (deduplicate across methods)
	let httpPaths = new Set<string>()

	for (let routes of Object.values(http)) {
		let routeList = routes.map((key) => {
			return key.path
		})

		// exclude internal built-in routes from the gateway listing
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

	// filter out internal WebSocket events from the gateway listing
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

	// build the registration payload for the gateway
	const registerObj = {
		event: "service:register",
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
	}

	// if the engine listens on a unix socket, include that path
	if (server.engine.SOCKET_PATH) {
		;(registerObj.data.listen as any).socket = server.engine.SOCKET_PATH
	}

	// connect to the gateway socket, send the payload, and disconnect
	const socket = new net.Socket()

	socket.connect(process.env.LB_GATEWAY_SOCKET)
	socket.write(JSON.stringify(registerObj))
	socket.end()
}
