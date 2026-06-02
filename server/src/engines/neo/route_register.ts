import { Route, RouteHttpMethods } from "../../classes/Route"

import type { HttpRequest, HttpResponse } from "uWebSockets.js"
import type Server from "../../server"
import type Engine from "./index"

export default function (this: Engine, route: Route<Server>) {
	if (!this.uws) {
		throw new Error("Engine is not initialized")
	}

	if (!(route instanceof Route)) {
		throw new Error("Invalid route provided")
	}

	// try to initialize the route
	try {
		route._initialize(this.server)
	} catch (err) {
		console.error(`Failed to initialize route:\n`, err)
		return
	}

	// normalize DELETE method for uWS compatibility
	if (route.method === "delete") {
		route.method = "del" as RouteHttpMethods
	}

	if (typeof this.uws[route.method] !== "function") {
		console.warn(
			`Invalid method (${route.method}) for route handler [${route.path}]\nSkipping route..`,
		)
		return
	}

	this.registers.add({
		method: route.method,
		path: route.path,
	})

	this.uws[route.method](route.path, (res: HttpResponse, req: HttpRequest) =>
		this.on_request(req, res, route),
	)
}
