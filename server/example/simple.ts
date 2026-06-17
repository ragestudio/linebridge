import { Server } from "../src/server"
import { Route } from "../src/classes/Route"

class MainRoute extends Route<API> {
	path = "/"

	catched = JSON.stringify({
		test: "hi!",
	})

	handler = async (req: any, res: any) => {
		res.end(this.catched)
	}
}

class API extends Server {
	static baseRoutes = false

	async onInitialize() {
		this.engine.register(MainRoute)
	}
}

Boot(API)
