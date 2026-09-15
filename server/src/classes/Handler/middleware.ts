import type { Request, Response } from "./http"
import type {
	ServerRequest,
	ServerResponse,
	ContextsKeys,
	MiddlewaresKeys,
	ExtractReqExt,
	ExtractResExt,
	Contexts,
} from "../../types"
import type { Server } from "../../server"

export interface MiddlewareHandlerFunction<
	TReq extends Request = Request,
	TRes extends Response = Response,
	ReqExt = {},
	ResExt = {},
> {
	(req: TReq & ReqExt, res: TRes & ResExt, next: () => void, ctx?: any): any
	_reqExt?: ReqExt
	_resExt?: ResExt
	useMiddlewares?: readonly string[]
	useContexts?: readonly string[]
}

export type MiddlewareObj<
	Child = Server<any>,
	SelectedCtx extends ContextsKeys<Child> = any,
	SelectedMw extends MiddlewaresKeys<Child> = any,
> = {
	useContexts?: readonly SelectedCtx[]
	useMiddlewares?: readonly SelectedMw[]
	fn: MiddlewareHandlerFunction
}

/**
 * Hook to define a middleware.
 * Optionally provide `<typeof API>` as a generic parameter to get strong typing
 * for all available contexts (including those injected by plugins).
 */
export function defineMiddleware<Child = Server<any>>(): {
	<
		ReqExt = {},
		ResExt = {},
		const UseContexts extends readonly ContextsKeys<Child>[] = readonly [],
		const UseMiddlewares extends readonly MiddlewaresKeys<Server<any>>[] =
			readonly [],
	>(definition: {
		useContexts?: UseContexts
		useMiddlewares?: UseMiddlewares
		/** Helper property to inject types into `req` without explicit generics (e.g. `injectReq: {} as { lol: number }`) */
		injectReq?: ReqExt
		/** Helper property to inject types into `res` without explicit generics */
		injectRes?: ResExt
		fn: (
			req: ServerRequest<Server<any>> &
				ExtractReqExt<Server<any>, UseMiddlewares[number]> &
				ReqExt,
			res: ServerResponse<Server<any>> &
				ExtractResExt<Server<any>, UseMiddlewares[number]> &
				ResExt,
			next: () => void,
			ctx: UseContexts extends readonly [any, ...any[]]
				? Pick<Contexts<Child>, UseContexts[number]>
				: unknown,
		) => any
	}): MiddlewareObj<
		Server<any>,
		UseContexts[number] extends ContextsKeys<Server<any>>
			? UseContexts[number]
			: any,
		UseMiddlewares[number]
	> & {
		fn: MiddlewareHandlerFunction<
			ServerRequest<Server<any>>,
			ServerResponse<Server<any>>,
			ReqExt,
			ResExt
		>
	}
	<ReqExt = {}, ResExt = {}>(
		fn: (
			req: ServerRequest<Server<any>> & ReqExt,
			res: ServerResponse<Server<any>> & ResExt,
			next: () => void,
		) => any,
	): MiddlewareHandlerFunction<
		ServerRequest<Server<any>>,
		ServerResponse<Server<any>>,
		ReqExt,
		ResExt
	>
} {
	return ((definition: any) => {
		if (typeof definition === "function") {
			return definition
		}

		const handler = async (req: any, res: any, next: () => void, ctx: any) => {
			return await definition.fn(req, res, next, ctx)
		}

		handler.useMiddlewares = definition.useMiddlewares ?? []
		handler.useContexts = definition.useContexts ?? []

		handler._reqExt = definition.injectReq
		handler._resExt = definition.injectRes

		return handler
	}) as any
}
