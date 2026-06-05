/**
 * @fileoverview The middleware iteration loop.
 *
 * Walks through the middleware array one element at a time, calling each
 * middleware's `execute` method with a `next` callback that recurses into the
 * next middleware or the final route handler.
 */

import type Engine from "."
import type Request from "./request"
import type Response from "./response"
import type { Route } from "../../classes/Route"
import type { Handler } from "../../classes/Handler"

/** HTTP methods that never carry a request body. */
const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"])

/**
 * Recursively iterates the middleware chain, then calls the route handler.
 *
 * On the first call (cursor === 0) it parses the request body (if needed).
 * Each middleware receives `(req, res, next)`. If a middleware does not call `next()`,
 * the iterator auto-advances to avoid hanging (unless the response was already sent).
 *
 * @param cursor - Zero-based index into the middleware array. Increments on each recursion.
 */
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
		// on the first middleware, parse the request body before passing control
		if (cursor == 0) {
			response._cork = true

			if (!BODYLESS_METHODS.has(request._method)) {
				request._body_parser_run(response, this.options.max_body_length)
				await request.parseBody()

				if (response.completed) return
			}
		}

		if (middleware) {
			// track the cursor position to detect double-next() calls
			response._track_middleware_cursor(cursor)

			let nextCalled = false

			/**
			 * Advances to the next middleware or the route handler.
			 */
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

			// if middleware didn't call next() and didn't send a response, auto-advance
			if (!nextCalled && !response.completed) {
				await next()
			}
		} else {
			// no more middlewares — execute the route handler
			await route.handler.execute(request, response)
		}
	} catch (error: any) {
		console.error("Unhandled error:", error)

		if (!response.completed) {
			response.status(500).json({ error: error.message })
		}
	}
}
