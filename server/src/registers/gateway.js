import net from "node:net"
import getRoutes from "../utils/getRoutes"

export default async (server) => {
	if (!process.env.LB_GATEWAY_SOCKET) {
		console.error("LB_GATEWAY_SOCKET not available")
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

	const registerObj = {
		event: "service:register",
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
	}

	if (server.engine.SOCKET_PATH) {
		registerObj.data.listen.socket = server.engine.SOCKET_PATH
	}

	// emit event to ultragateway unix socket
	const socket = new net.Socket()

	socket.connect(process.env.LB_GATEWAY_SOCKET)
	socket.write(JSON.stringify(registerObj))
	socket.end()
}
