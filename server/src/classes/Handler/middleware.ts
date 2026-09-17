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
		const UseMiddlewares extends readonly MiddlewaresKeys<Child>[] =
			readonly [],
	>(definition: {
		useContexts?: UseContexts
		useMiddlewares?: UseMiddlewares
		/** Helper property to inject types into `req` without explicit generics (e.g. `injectReq: {} as { lol: number }`) */
		injectReq?: ReqExt
		/** Helper property to inject types into `res` without explicit generics */
		injectRes?: ResExt
		fn: (
			req: ServerRequest<Child> &
				ExtractReqExt<Child, UseMiddlewares[number]> &
				ReqExt,
			res: ServerResponse<Child> &
				ExtractResExt<Child, UseMiddlewares[number]> &
				ResExt,
			next: () => void,
			ctx: UseContexts extends readonly [any, ...any[]]
				? Pick<Contexts<Child>, UseContexts[number]>
				: unknown,
		) => any
	}): MiddlewareObj<
		Child,
		UseContexts[number] extends ContextsKeys<Child>
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
			req: ServerRequest<Child> & ReqExt,
			res: ServerResponse<Child> & ResExt,
			next: () => void,
		) => any,
	): MiddlewareHandlerFunction<
		ServerRequest<Child>,
		ServerResponse<Child>,
		ReqExt,
		ResExt
	>
} {
	return ((definition: any) => {
		return definition
	}) as any
}
