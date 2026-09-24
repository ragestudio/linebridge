/**
 * @fileoverview Registers a route (HTTP method + path) with the underlying uWS app.
 *
 * Supports passing a Route instance or a Route constructor. Normalizes method names
 * for uWS compatibility (e.g. "delete" → "del").
 */
import type { uWebsockets } from "./uws"
import type { Route, RouteHttpMethods } from "linebridge/classes/Route/index"
import type { NeoEngine } from "./engine"

type HttpRequest = uWebsockets.HttpRequest
type HttpResponse = uWebsockets.HttpResponse

/**
 * Registers a route with the engine's uWS app.
 *
 * @param route - A Route instance or a Route class (constructor).
 *
 * @throws {Error} If the engine is not initialized or the route is invalid.
 */
export default function (this: NeoEngine, route: Route) {
	if (!this.uws) {
		throw new Error("Engine is not initialized")
	}

	// normalize DELETE method for uWS compatibility (uWS uses "del" internally)
	if (route.method === "delete") {
		route.method = "del" as RouteHttpMethods
	}

	// verify the method is a valid uWS route method before registering
	if (typeof this.uws[route.method] !== "function") {
		console.warn(
			`Invalid method (${route.method}) for route handler [${route.path}]\nSkipping route..`,
		)
		return
	}

	this.registers.add({
		kind: route.kind,
		method: route.method,
		path: route.path,
		useContexts: route.useContexts,
		useMiddlewares: route.useMiddlewares,
		_source_file: route._source_file,
		handler: route.handler,
	})

	if (route.kind === "http") {
		this.uws[route.method](
			route.path,
			(res: HttpResponse, req: HttpRequest) =>
				this.on_request(req, res, route),
		)
	}
}
