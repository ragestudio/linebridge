import { Route, RouteHttpMethods } from "../../classes/Route"

import type { HttpRequest, HttpResponse } from "uWebSockets.js"
import type Engine from "./index"

export default function (this: Engine, route: Route | (new () => Route)) {
	if (!this.uws) {
		throw new Error("Engine is not initialized")
	}

	let routeInstance: Route

	if (typeof route === "function") {
		try {
			routeInstance = new route()
		} catch (err) {
			console.error(`Failed to construct route class:\n`, err)
			return
		}
	} else if (route instanceof Route) {
		routeInstance = route
	} else {
		throw new Error("Invalid route provided")
	}

	// try to initialize the route
	try {
		routeInstance._initialize(this.server)
	} catch (err) {
		console.error(`Failed to initialize route:\n`, err)
		return
	}

	// normalize DELETE method for uWS compatibility
	if (routeInstance.method === "delete") {
		routeInstance.method = "del" as RouteHttpMethods
	}

	if (typeof this.uws[routeInstance.method] !== "function") {
		console.warn(
			`Invalid method (${routeInstance.method}) for route handler [${routeInstance.path}]\nSkipping route..`,
		)
		return
	}

	this.registers.add({
		method: routeInstance.method,
		path: routeInstance.path,
	})

	this.uws[routeInstance.method](
		routeInstance.path,
		(res: HttpResponse, req: HttpRequest) =>
			this.on_request(req, res, routeInstance),
	)
}
