import getRoutes from "../utils/getRoutes"

export default async (server) => {
	if (!process.env.lb_service || !process.send) {
		console.error("IPC not available")
		return null
	}

	let { http, websocket } = getRoutes(server.engine)

	let httpPaths = new Set()

	// get all the http routes
	for (let routes of Object.values(http)) {
		routes = routes.map((key) => {
			return key.route
		})

		routes = routes.filter((key) => {
			if (key === "/" || key === "/_map") {
				return false
			}

			return true
		})

		routes.forEach((key) => {
			httpPaths.add(key)
		})
	}

	http = Array.from(httpPaths)

	// filter out the ping and topic events
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

	// send the service info to the main process
	process.send({
		type: "service:register",
		data: {
			namespace: server.params.refName,
			secure: server.hasSSL,
			http: {
				enabled: true,
				proto: server.hasSSL ? "https" : "http",
				paths: http,
			},
			websocket: {
				enabled: server.params.websockets?.enabled ?? false,
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
