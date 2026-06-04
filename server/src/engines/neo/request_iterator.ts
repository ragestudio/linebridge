import type Engine from "."
import type Request from "./request"
import type Response from "./response"
import type { Route } from "../../classes/Route"
import type { Handler } from "../../classes/Handler"

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"])

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
		if (cursor == 0) {
			response._cork = true

			if (!BODYLESS_METHODS.has(request._method)) {
				request._body_parser_run(response, this.options.max_body_length)
				await request.parseBody()

				if (response.completed) return
			}
		}

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

			if (!nextCalled && !response.completed) {
				await next()
			}
		} else {
			await route.handler.execute(request, response)
		}
	} catch (error: any) {
		console.error("Unhandled error:", error)

		if (!response.completed) {
			response.status(500).json({ error: error.message })
		}
	}
}
