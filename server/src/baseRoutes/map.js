import Route from "../classes/Route"
import getRoutes from "../utils/getRoutes"

export default class MapRoute extends Route {
	static route = "/_map"

	get = async (req, res) => {
		return res.json(getRoutes(this.server.engine))
	}
}
