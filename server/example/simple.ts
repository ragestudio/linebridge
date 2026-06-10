import { Server } from "../src/server"
import { Route } from "../src/classes/Route"

class MainRoute extends Route<API> {
	path = "/"

	handler = async (req: any, res: any) => {
		res.end(
			JSON.stringify({
				test: "hi!",
			}),
		)
	}
}

class API extends Server {
	static baseRoutes = false

	async onInitialize() {
		this.engine.register(MainRoute)
	}
}

Boot(API)
