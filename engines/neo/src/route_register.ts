/**
 * @fileoverview Registers a route (HTTP method + path) with the underlying uWS app.
 *
 * Supports passing a Route instance or a Route constructor. Normalizes method names
 * for uWS compatibility (e.g. "delete" → "del").
 */
import type { uWebsockets } from "./uws"
type HttpRequest = uWebsockets.HttpRequest
type HttpResponse = uWebsockets.HttpResponse
import type Engine from "./engine"

import {
	Route,
	RouteAlike,
	RouteHttpMethods,
} from "linebridge/classes/Route/index"
import { HandlerKind } from "linebridge/classes/Handler/index"

/**
 * Registers a route with the engine's uWS app.
 *
 * @param route - A Route instance or a Route class (constructor).
 *
 * @throws {Error} If the engine is not initialized or the route is invalid.
 */
export default function (this: Engine, route: RouteAlike) {
	if (!this.uws) {
		throw new Error("Engine is not initialized")
	}

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
		routeInstance.kind = HandlerKind.http
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
		routeInstance._initialize(this.server)
	} catch (err) {
		console.error(`Failed to initialize route:\n`, err)
		return
	}

	// normalize DELETE method for uWS compatibility (uWS uses "del" internally)
	if (routeInstance.method === "delete") {
		routeInstance.method = "del" as RouteHttpMethods
	}

	// verify the method is a valid uWS route method before registering
	if (typeof this.uws[routeInstance.method] !== "function") {
		console.warn(
			`Invalid method (${routeInstance.method}) for route handler [${routeInstance.path}]\nSkipping route..`,
		)
		return
	}

	this.registers.add({
		kind: routeInstance.kind,
		method: routeInstance.method,
		path: routeInstance.path,
		useContexts: routeInstance.useContexts,
		useMiddlewares: routeInstance.useMiddlewares,
		_source_file: routeInstance._source_file,
		handler: routeInstance.handler,
	})

	this.uws[routeInstance.method](
		routeInstance.path,
		(res: HttpResponse, req: HttpRequest) =>
			this.on_request(req, res, routeInstance),
	)
}
