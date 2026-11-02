import type { Contexts, ContextsKeys } from "linebridge/types"
import type { RouteObject } from "linebridge/classes/Route/index"

import { HandlerKind } from "linebridge/classes/Handler/index"

import { NatsRequest } from "./request"

/**
 * Convenience helper for NATS routes.
 *
 * The shared defineRoute keeps the req/res signature; this helper exposes the
 * decoded payload and the resolved contexts directly.
 */
export function defineNatsRoute<Child, P = unknown, R = unknown>(route: {
	path?: string
	queue?: string
	useContexts?: readonly ContextsKeys<Child>[]
	useMiddlewares?: readonly unknown[]
	fn: (
		data: P,
		ctx: Pick<
			Contexts<Child>,
			Extract<ContextsKeys<Child>, keyof Contexts<Child>>
		>,
	) => R | Promise<R>
}): RouteObject<Child, any, HandlerKind.generic, any> {
	return {
		kind: HandlerKind.generic,
		path: route.path,
		queue: route.queue,
		useContexts: route.useContexts,
		useMiddlewares: route.useMiddlewares,
		fn: (req: NatsRequest<P>, _res: unknown, ctx: any) => {
			return route.fn(req.data, ctx)
		},
	} as unknown as RouteObject<Child, any, HandlerKind.generic, any>
}

export default defineNatsRoute
