/**
 * @fileoverview The main HTTP request entry point called by uWS when a request matches a route.
 *
 * It creates Request and Response wrappers, runs the middleware + handler pipeline,
 * and includes a "fast path" optimisation for routes with zero or one middleware.
 */

import Request from "./request"
import Response from "./response"

import type {
	us_socket_context_t,
	HttpRequest,
	HttpResponse,
} from "uWebSockets.js"
import type { Route } from "../../classes/Route"
import type Engine from "."

/** HTTP methods that never carry a request body. */
const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"])
/** No-op next() placeholder used when there is no real middleware chain. */
const EMPTY_NEXT = () => {}

/**
 * Entry point for every incoming HTTP request.
 *
 * Wraps the raw uWS request/response objects into framework-level Request/Response
 * instances, then dispatches through middleware and the route handler.
 *
 * @param native_req - Raw uWS HttpRequest.
 * @param native_res - Raw uWS HttpResponse.
 * @param route - The matched route object.
 * @param socket - Upgrade socket context (only set for WebSocket upgrade requests).
 */
export default function (
	this: Engine,
	native_req: HttpRequest,
	native_res: HttpResponse,
	route: Route<any>,
	socket?: us_socket_context_t | null,
): any {
	try {
		const request = Request.create(route, native_req, native_res)
		const response = Response.create(native_res, route, request, socket)

		// if a zero-handler is pending (server is draining), reject new requests
		if (this.pending_requests_zero_handler) return response.close()

		if (!route.handler) {
			console.warn(
				`Route [${route.path}] is registered, but does not have a valid handler.`,
			)
			this.defaultResponse(request, response)
			return null
		}

		this.pending_requests_count++

		// Start body parsing immediately if needed
		if (!BODYLESS_METHODS.has(request.method)) {
			request._body_parser_run(response, this.options.max_body_length)
		}

		// fast path: no middleware or at most one global middleware
		if (this.middlewares.length <= 1 && route.middlewares.length === 0) {
			return _fastPath.call(this, request, response, route)
		}

		// merge global and route-level middlewares
		const allMiddlewares =
			route.middlewares.length > 0
				? [...this.middlewares, ...route.middlewares]
				: this.middlewares

		return this.request_iterator(request, response, route, allMiddlewares)
	} catch (exception: any) {
		console.error("Internal fatal error:", exception)

		// try to respond with a 500 even in catastrophic failure
		native_res.writeStatus("500")
		native_res.end(
			JSON.stringify({ fatal: true, error: exception.message }),
		)
	}
}

/**
 * Optimised path for routes that have zero or one global middleware.
 * Skips the full iterator overhead.
 */
function _fastPath(
	this: Engine,
	request: Request<any>,
	response: Response<any>,
	route: Route<any>,
): any {
	const runMiddlewares = () => {
		if (this.middlewares.length === 1) {
			const mwResult = this.middlewares[0].fn(
				request,
				response,
				EMPTY_NEXT,
			)

			// wait for async middleware to finish before calling the handler
			if (mwResult instanceof Promise) {
				return mwResult.then(() => {
					if (response.completed) return
					return _executeHandler.call(this, request, response, route)
				})
			}

			if (response.completed) return
		}

		return _executeHandler.call(this, request, response, route)
	}

	if (!BODYLESS_METHODS.has(request.method)) {
		return request.parseBody().then(() => {
			if (response.completed) return
			return runMiddlewares()
		})
	}

	return runMiddlewares()
}

/**
 * Parses the request body (if needed) then invokes the route handler
 * through the standard Handler.execute path, which uses res.send()
 * and properly corks writes to uWS.
 */
function _executeHandler(
	this: Engine,
	request: Request<any>,
	response: Response<any>,
	route: Route<any>,
): any {
	response._cork = true
	return route.handler.execute(request, response)
}
