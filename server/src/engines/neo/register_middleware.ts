/**
 * @fileoverview Registers a global middleware that runs before every route handler.
 *
 * Middlewares can be passed as a plain async function or as a Handler wrapper.
 * If a plain function is passed, it is automatically wrapped in a Handler.
 */

import { Handler, HandlerKind } from "../../classes/Handler"

import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"
import type Engine from "./index"
import type Server from "../../server"
import type Request from "./request"
import type Response from "./response"

/**
 * Adds a middleware to the engine's global middleware stack.
 *
 * @param middleware - Either a raw `(req, res, next) => void` function
 *   or a pre-built Handler instance.
 */
export default function (
	this: Engine,
	middleware:
		| MiddlewareHandlerFunction<Request<Server>, Response<Server>>
		| Handler<HandlerKind.middleware>,
) {
	// auto-wrap plain functions so they work with the Handler lifecycle
	if (!(middleware instanceof Handler)) {
		middleware = new Handler<HandlerKind.middleware>({
			kind: HandlerKind.middleware,
			engine: this,
			fn: middleware as any,
		})
	}

	this.middlewares.push(middleware)
}
