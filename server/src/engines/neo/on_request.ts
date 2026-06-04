import Request from "./request"
import Response from "./response"

import type {
	us_socket_context_t,
	HttpRequest,
	HttpResponse,
} from "uWebSockets.js"
import type { Route } from "../../classes/Route"
import type Engine from "."

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"])
const EMPTY_NEXT = () => {}

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

		if (this.pending_requests_zero_handler) return response.close()

		if (!route.handler) {
			console.warn(
				`Route [${route.path}] is registered, but does not have a valid handler.`,
			)
			this.defaultResponse(request, response)
			return null
		}

		this.pending_requests_count++

		if (this.middlewares.length <= 1 && route.middlewares.length === 0) {
			return _fastPath.call(this, request, response, route)
		}

		const allMiddlewares =
			route.middlewares.length > 0
				? [...this.middlewares, ...route.middlewares]
				: this.middlewares

		return this.request_iterator(request, response, route, allMiddlewares)
	} catch (exception: any) {
		console.error("Internal fatal error:", exception)

		native_res.writeStatus("500")
		native_res.end(
			JSON.stringify({ fatal: true, error: exception.message }),
		)
	}
}

function _fastPath(
	this: Engine,
	request: Request<any>,
	response: Response<any>,
	route: Route<any>,
): any {
	if (this.middlewares.length === 1) {
		const mwResult = this.middlewares[0].fn(request, response, EMPTY_NEXT)

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

function _executeHandler(
	this: Engine,
	request: Request<any>,
	response: Response<any>,
	route: Route<any>,
): any {
	response._cork = true

	if (!BODYLESS_METHODS.has(request._method)) {
		//response._cork = true
		request._body_parser_run(response, this.options.max_body_length)

		return request.parseBody().then(() => {
			if (response.completed) {
				return
			}

			return _invokeHandler(request, response, route)
		})
	}

	return _invokeHandler(request, response, route)
}

function _invokeHandler(
	request: Request<any>,
	response: Response<any>,
	route: Route<any>,
): any {
	try {
		const result = route.handler.fn(request, response, request.ctx)

		if (result instanceof Promise) {
			return result.then(
				(r: any) => {
					console.log(r)
					if (r && !response.completed) {
						response._headers["content-type"] = "application/json"
						response._sendFast(JSON.stringify(r))
					}
				},
				(error: any) => {
					if (!response.completed) {
						response.status(500).json({
							error: error.message,
						})
					}
				},
			)
		}

		if (result && !response.completed) {
			response._headers["content-type"] = "application/json"
			const body =
				typeof result === "string" ? result : JSON.stringify(result)
			response._sendFast(body)
		}
	} catch (error: any) {
		if (!response.completed) {
			response.status(500).json({ error: error.message })
		}
	}
}
