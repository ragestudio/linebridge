import Route from "../classes/Route"
import getRoutes from "../utils/getRoutes"

import type Server from "../server"
import type { HttpHandlerFunction } from "../classes/Handler/http"

export default class MapRoute extends Route<Server> {
	path = "/_map"

	handler: HttpHandlerFunction = async (req, res) => {
		return getRoutes(this.server.engine)
	}
}
