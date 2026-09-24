import type { RouteAlike, RouteKind } from "../classes/Route"
import type { Server } from "../server"

import { Route } from "../classes/Route"
import { HandlerKind } from "../classes/Handler"

export default function (
	this: Server<any>,
	route: RouteAlike,
	kind: RouteKind = HandlerKind.http,
) {
	let routeInstance: Route

	// support passing a class constructor or an already-constructed instance
	if (typeof route === "function") {
		try {
			routeInstance = new route()
		} catch (err) {
			console.error(`Failed to construct route class:\n`, err)
			return
		}
	} else if (route instanceof Route) {
		routeInstance = route
	} else if (typeof route.fn === "function") {
		routeInstance = new Route()
		routeInstance.kind = kind
		routeInstance.path = route.path ?? "/"
		routeInstance.method = route.method ?? "get"
		routeInstance.useContexts = route.useContexts ?? []
		routeInstance.useMiddlewares = route.useMiddlewares ?? []
		routeInstance.fn = route.fn
	} else {
		throw new Error("Invalid route provided")
	}

	// try to initialize the route
	try {
		routeInstance = routeInstance._initialize(this)
	} catch (err) {
		console.error(`Failed to initialize route:\n`, err)
		return
	}

	// send the route to the engine
	this.engine.register(routeInstance)
}
