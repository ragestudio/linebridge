import type { Request, Response } from "./http"

export type MiddlewareHandlerFunction<
	TReq extends Request = Request,
	TRes extends Response = Response,
> = (req: TReq, res: TRes, next: () => void) => any
