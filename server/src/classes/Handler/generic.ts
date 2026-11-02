/**
 * Protocol agnostic request/response contract for generic handlers.
 *
 * Engines are free to provide their own request shape, but the response must
 * expose a way to complete the operation and report errors so the shared
 * Handler pipeline can close the exchange consistently.
 */
export interface GenericRequest<TData = unknown> {
	data: TData
}

export interface GenericResponse {
	completed: boolean
	send(data: unknown): void
	error(error: unknown, code?: number): void
}

export type GenericHandlerFunction<
	TCtx = Record<string, any>,
	TReq = unknown,
	TRes = unknown,
> = (req: TReq, res: TRes, ctx: TCtx) => unknown

export type GenericMiddlewareFunction<
	TCtx = Record<string, any>,
	TReq = unknown,
	TRes = GenericResponse,
> = (req: TReq, res: TRes, next: () => void, ctx: TCtx) => unknown

export type GenericMiddlewareObj<TReq = unknown, TRes = GenericResponse> = {
	useContexts?: readonly string[]
	useMiddlewares?: readonly unknown[]
	fn: GenericMiddlewareFunction<any, TReq, TRes>
}
