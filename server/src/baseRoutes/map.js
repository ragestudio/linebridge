import Route from "../classes/Route"

export default class MapRoute extends Route {
	static route = "/_map"

	get = async (req, res) => {
		const httpMap = Array.from(this.server.engine.map.entries()).reduce(
			(acc, [route, { method, path }]) => {
				if (!acc[method]) {
					acc[method] = []
				}

				acc[method].push({
					route: path,
				})

				return acc
			},
			{},
		)

		return res.json({
			http: httpMap,
			websocket: [],
		})
	}
}
