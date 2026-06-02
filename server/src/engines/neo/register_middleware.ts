import { Handler, HandlerKind } from "../../classes/Handler"

import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"
import type Engine from "./index"
import type Server from "../../server"
import type Request from "./request"
import type Response from "./response"

export default function (
	this: Engine,
	middleware:
		| MiddlewareHandlerFunction<Request<Server>, Response<Server>>
		| Handler<HandlerKind.middleware>,
) {
	if (!(middleware instanceof Handler)) {
		middleware = new Handler<HandlerKind.middleware>({
			kind: HandlerKind.middleware,
			engine: this,
			fn: middleware as any,
		})
	}

	this.middlewares.push(middleware)
}
