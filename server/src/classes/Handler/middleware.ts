import type { Request, Response } from "./http"

export interface MiddlewareHandlerFunction<
	TReq extends Request = Request,
	TRes extends Response = Response,
	ReqExt = {},
	ResExt = {},
> {
	(req: TReq & ReqExt, res: TRes & ResExt, next: () => void): any
	_reqExt?: ReqExt
	_resExt?: ResExt
}

export function defineMiddleware<ReqExt = {}, ResExt = {}>() {
	return function <
		TReq extends Request = Request,
		TRes extends Response = Response,
	>(
		fn: (req: TReq & ReqExt, res: TRes & ResExt, next: () => void) => any,
	): MiddlewareHandlerFunction<TReq, TRes, ReqExt, ResExt> {
		return fn as MiddlewareHandlerFunction<TReq, TRes, ReqExt, ResExt>
	}
}
