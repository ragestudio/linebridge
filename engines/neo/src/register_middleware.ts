/**
 * @fileoverview Registers a global middleware that runs before every route handler.
 *
 * Middlewares can be passed as a plain async function or as a Handler wrapper.
 * If a plain function is passed, it is automatically wrapped in a Handler.
 */

import { Handler, HandlerKind } from "linebridge/classes/Handler/index"

import type Engine from "./engine"

/**
 * Adds a middleware to the engine's global middleware stack.
 *
 * @param middleware - Either a raw `(req, res, next) => void` function
 *   or a pre-built Handler instance.
 */
export default function (this: Engine, middleware: any) {
	let middlewareCtx: Record<string, any> | undefined

	if (
		middleware &&
		typeof middleware === "object" &&
		!(middleware instanceof Handler) &&
		typeof middleware.fn === "function"
	) {
		if (
			Array.isArray(middleware.useContexts) &&
			middleware.useContexts.length > 0
		) {
			middlewareCtx = {}
			const allContexts = Object.assign(
				{},
				this.server.contexts,
				this.server.base_contexts,
			)
			for (const ctxKey of middleware.useContexts) {
				if (ctxKey in allContexts) {
					middlewareCtx[ctxKey] = allContexts[ctxKey]
				}
			}
		}
		middleware = middleware.fn
	}

	// auto-wrap plain functions so they work with the Handler lifecycle
	if (!(middleware instanceof Handler)) {
		middleware = new Handler<HandlerKind.middleware>({
			kind: HandlerKind.middleware,
			engine: this,
			fn: middleware as any,
			ctx: middlewareCtx,
		})
	}

	this.middlewares.push(middleware)
}
