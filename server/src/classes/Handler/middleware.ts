import type { Request, Response } from "./http"

export type MiddlewareHandlerFunction<TReq = Request, TRes = Response> = (
	req: TReq,
	res: TRes,
	next: () => void,
) => Promise<any>
