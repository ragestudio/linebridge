import getRoutes from "../utils/getRoutes"
import type Server from "../server"

export default async (server: Server): Promise<void | null> => {
	if (!process.env.lb_service || !process.send) {
		console.error("IPC not available")
		return null
	}

	if (!server.engine) return null

	let { http, websocket } = getRoutes(server.engine)

	let httpPaths = new Set<string>()

	for (let routes of Object.values(http)) {
		let routeList = routes.map((key) => {
			return key.route
		})

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
