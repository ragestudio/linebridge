import Request from "./request"
import Response from "./response"

import type {
	us_socket_context_t,
	HttpRequest,
	HttpResponse,
} from "uWebSockets.js"
import type { Route } from "../../classes/Route"
import type Engine from "."

export default async function (
	this: Engine,
	native_req: HttpRequest,
	native_res: HttpResponse,
	route: Route<typeof this.server>,
	socket?: us_socket_context_t | null,
): Promise<any> {
	try {
		// construct the request
		const request = new Request(route, native_req, native_res)

		// construct the response
		const response = new Response(native_res)
		response.route = route
		response._wrapped_request = request
		response._upgrade_socket = socket || null

		// If we are in the process of gracefully shutting down, we must immediately close the request
		if (this.pending_requests_zero_handler) return response.close()

		// if no valid handler, just treat as 404 but emit a warning
		if (!route.handler) {
			console.warn(
				`Route [${route.path}] is registered, but does not have a valid handler. Maybe is not properly initialized with a "Route" class.`,
			)

			this.defaultResponse(request, response)
			return null
		}

		// Increment the pending request count
		this.pending_requests_count++

		const allMiddlewares = [...this.middlewares, ...route.middlewares]

		await this.request_iterator(request, response, route, allMiddlewares)
	} catch (exception: any) {
		console.error("Internal fatal error:", exception)

		native_res.writeStatus("500")
		native_res.end(
			JSON.stringify({ fatal: true, error: exception.message }),
		)
	}
}
