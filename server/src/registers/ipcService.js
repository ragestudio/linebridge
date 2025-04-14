export default async (server) => {
	if (!process.env.lb_service || !process.send) {
		console.error("IPC not available")
		return null
	}

	// get only the root paths
	let paths = Array.from(server.engine.map.keys()).map((key) => {
		const root = key.split("/")[1]

		return "/" + root
	})

	// remove duplicates
	paths = [...new Set(paths)]

	// remove "" and _map
	paths = paths.filter((key) => {
		if (key === "/" || key === "/_map") {
			return false
		}

		return true
	})

	process.send({
		type: "service:register",
		id: process.env.lb_service.id,
		index: process.env.lb_service.index,
		register: {
			namespace: server.params.refName,
			http: {
				enabled: true,
				paths: paths,
				proto: server.hasSSL ? "https" : "http",
			},
			websocket: {
				enabled: server.params.websockets,
				path: server.params.refName ?? `/${server.params.refName}`,
			},
			listen: {
				ip: server.params.listenIp,
				port: server.params.listenPort,
			},
		},
	})
}
