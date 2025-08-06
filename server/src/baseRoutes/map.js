import Route from "../classes/Route"

export default class MapRoute extends Route {
	static route = "/_map"

	get = async (req, res) => {
		const httpMap = {}
		const wsMap = []

		for (const { method, route } of this.server.engine.registers) {
			if (!httpMap[method]) {
				httpMap[method] = []
			}

			httpMap[method].push({
				route: route,
			})
		}

		if (this.server.engine.ws) {
			for (const [
				event,
				handler,
			] of this.server.engine.ws.events.entries()) {
				wsMap.push(event)
			}
		}

		return res.json({
			http: httpMap,
			websocket: wsMap,
		})
	}
}
