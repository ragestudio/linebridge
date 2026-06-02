import type Engine from "."
import type Request from "./request"
import type Response from "./response"
import type { Route } from "../../classes/Route"
import type { Handler } from "../../classes/Handler"

export default async function (
	this: Engine,
	request: Request<any>,
	response: Response<any>,
	route: Route<typeof this.server>,
	allMiddlewares: Handler[],
	cursor: number = 0,
) {
	if (response.completed) return

	const middleware = allMiddlewares[cursor]

	try {
		if (middleware) {
			response._track_middleware_cursor(cursor)

			let nextCalled = false

			const next = async () => {
				nextCalled = true

				await this.request_iterator(
					request,
					response,
					route,
					allMiddlewares,
					cursor + 1,
				)
			}

			await middleware.execute(request, response, next)

			// auto-continue if middleware did not call next()
			// and the response has not been sent yet
			if (!nextCalled && !response.completed) {
				await next()
			}
		} else {
			if (
				request._body_parser_run(response, this.options.max_body_length)
			) {
				if (
					request._body_expected_bytes > -1 ||
					request._body_chunked_transfer
				) {
					await request.parseBody()
				}

				await route.handler.execute(request, response)
				if (!response.completed) response._cork = true
			}
		}
	} catch (error: any) {
		console.error("Unhandled error:", error)

		if (!response.completed) {
			response.status(500).json({ error: error.message })
		}
	}
}
