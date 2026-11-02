import Handler, {
	HandlerFunctionByKind,
	HandlerKind,
	type GenericHandlerFunction,
} from "../Handler"
import parsePathParameters from "../../utils/parsePathParameters"

import type { ServerInstance } from "../../types"
import type { Server } from "../../server"
import type { HttpHandlerFunction } from "../Handler/http"
import type { WebsocketHandlerFunction } from "../Handler/websocket"
import type {
	ExtractReqExt,
	ExtractResExt,
	ContextsKeys,
	MiddlewaresKeys,
	Contexts,
	ServerRequest,
	ServerResponse,
} from "../../types"

type PickedContexts<Child, UseContexts> = UseContexts extends readonly [
	any,
	...any[],
]
	? Pick<Contexts<Child>, Extract<UseContexts[number], keyof Contexts<Child>>>
	: unknown

export type RouteKind = "http" | "ws" | "generic"
export type RouteHttpMethods =
	| "any"
	| "get"
	| "post"
	| "put"
	| "delete"
	| "patch"
	| "options"
	| "head"

type RouteHandlerFor<
	Child,
	Kind extends RouteKind,
	SelectedCtx,
	SelectedMw extends MiddlewaresKeys<Child>,
> = Kind extends "ws"
	? WebsocketHandlerFunction<SelectedCtx>
	: Kind extends "generic"
		? GenericHandlerFunction<
				SelectedCtx,
				ServerRequest<Child>,
				ServerResponse<Child>
			>
		: HttpHandlerFunction<
				SelectedCtx,
				ServerRequest<Child> & ExtractReqExt<Child, SelectedMw>,
				ServerResponse<Child> & ExtractResExt<Child, SelectedMw>
			>

export type RouteObject<
	Child = Server<any>,
	SelectedCtx extends ContextsKeys<Child> = ContextsKeys<Child>,
	Kind extends RouteKind = HandlerKind.http,
	SelectedMw extends MiddlewaresKeys<Child> = MiddlewaresKeys<Child>,
> = {
	path?: string
	queue?: string
	useMiddlewares?: readonly SelectedMw[]
	useContexts?: readonly SelectedCtx[]
	fn: RouteHandlerFor<
		Child,
		Kind,
		Pick<Contexts<Child>, Extract<SelectedCtx, keyof Contexts<Child>>>,
		SelectedMw
	>
} & (Kind extends "http"
	? { kind?: "http"; method?: RouteHttpMethods }
	: { kind: Kind; method?: never })

export function defineRoute<
	Child = Server<any>,
	Kind extends RouteKind = HandlerKind.http,
>(serverClass?: Child) {
	const define = <
		const UseContexts extends readonly ContextsKeys<Child>[] = readonly [],
		const UseMiddlewares extends readonly MiddlewaresKeys<Child>[] =
			readonly [],
	>(
		route: {
			path?: string
			queue?: string
			useMiddlewares?: UseMiddlewares
			useContexts?: UseContexts
			fn: Kind extends "ws"
				? WebsocketHandlerFunction<PickedContexts<Child, UseContexts>>
				: Kind extends "generic"
					? GenericHandlerFunction<
							PickedContexts<Child, UseContexts>,
							ServerRequest<Child>,
							ServerResponse<Child>
						>
					: HttpHandlerFunction<
							PickedContexts<Child, UseContexts>,
							ServerRequest<Child> &
								ExtractReqExt<Child, UseMiddlewares[number]>,
							ServerResponse<Child> &
								ExtractResExt<Child, UseMiddlewares[number]>
						>
		} & (Kind extends "http"
			? { kind?: "http"; method?: RouteHttpMethods }
			: { kind?: Kind; method?: never }),
	): typeof route => route

	return define
}

// routealike trys to match a RouteObject or a non-constructed Route or a constructed Route
export type RouteAlike<TServer = Server<any>> =
	| Route<TServer>
	| (new () => Route<TServer>)
	| RouteObject

export class Route<
	TServer = Server<any>,
	TContextKeys extends ContextsKeys<TServer>[] = ContextsKeys<TServer>[],
> {
	_initialized: Boolean = false
	server!: Server<any> & ServerInstance<TServer>

	kind: RouteKind = "http"
	path: string = "/"
	queue?: string
	method: RouteHttpMethods = "get"
	useContexts: readonly ContextsKeys<TServer>[] = []
	useMiddlewares: readonly MiddlewaresKeys[] = []
	pathParametersKey: any
	streaming?: any

	_source_file?: string

	middlewares: Handler<any>[] = []
	ctx: Record<string, any> = {}
	handler!: Handler<any>
	fn!: Function

	get engine() {
		return this.server.engine
	}

	constructor() {}

	_initialize = (
		server: Server<any> & ServerInstance<TServer>,
		definitions?: Route<TServer, TContextKeys>,
	) => {
		if (!server) {
			throw new Error("server is not defined")
		}

		this.server = server

		if (typeof definitions === "object") {
			if (typeof definitions.path === "string") {
				this.path = definitions.path
			}

			if (typeof definitions.kind === "string") {
				this.kind = definitions.kind
			}

			if (typeof definitions.queue === "string") {
				this.queue = definitions.queue
			}

			if (typeof definitions.method === "string") {
				this.method = definitions.method
			}

			if (Array.isArray(definitions.useContexts)) {
				this.useContexts = definitions.useContexts
			}

			if (Array.isArray(definitions.useMiddlewares)) {
				this.useMiddlewares = [...definitions.useMiddlewares]
			}

			if (definitions.handler instanceof Handler) {
				this.handler = definitions.handler
			}
		}

		if (!this.handler && !this.fn) {
			throw new Error(
				`Route [${this.path}] does not have a handler or fn`,
			)
		}

		if (this.kind === HandlerKind.generic) {
			this.pathParametersKey = []
		} else {
			this.pathParametersKey = parsePathParameters(this.path)
		}

		const allContexts = Object.assign(
			{},
			this.server.contexts,
			this.server.base_contexts,
		)

		const allMiddlewares = Object.assign(
			{},
			this.server.middlewares,
			this.server.base_middlewares,
		)

		// resolve contexts from server
		if (this.useContexts && Array.isArray(this.useContexts)) {
			for (const key of this.useContexts) {
				if (key in allContexts) {
					this.ctx[key] = allContexts[key]
				}
			}
		}

		// register middlewares
		if (this.useMiddlewares && Array.isArray(this.useMiddlewares)) {
			const middlewareKind =
				this.kind === HandlerKind.generic
					? HandlerKind.generic
					: HandlerKind.middleware

			for (let key of this.useMiddlewares) {
				const isObjectMiddleware =
					typeof key === "object" &&
					key !== null &&
					typeof (key as any).fn === "function"

				if (
					typeof key !== "string" &&
					typeof key !== "function" &&
					!isObjectMiddleware
				) {
					console.warn(`invalid typeof use middleware:`, key)
					continue
				}

				let middleware: any =
					typeof key === "string" ? allMiddlewares[key] : key
				let middlewareCtx: Record<string, any> | undefined

				// if middleware is an object with a fn property (MiddlewareObj), extract the fn and resolve contexts
				if (
					middleware &&
					typeof middleware === "object" &&
					typeof middleware.fn === "function"
				) {
					if (
						Array.isArray(middleware.useContexts) &&
						middleware.useContexts.length > 0
					) {
						middlewareCtx = {}
						for (const ctxKey of middleware.useContexts) {
							if (ctxKey in allContexts) {
								middlewareCtx[ctxKey] = allContexts[ctxKey]
							}
						}
					}

					middleware = middleware.fn
				}

				// skip if cannot find a valid fn
				if (typeof middleware !== "function") {
					console.warn(
						`Route [${this.path}] require to use middleware [${key}], but is missing`,
					)
					continue
				}

				const handler = this._to_handler(middleware, middlewareKind)

				if (handler) {
					// assign resolved contexts to the middleware handler
					if (middlewareCtx) {
						handler.ctx = middlewareCtx
					}

					// push the middleware in that order
					this.middlewares.push(handler)
				}
			}
		}

		if (this.fn) {
			this.handler = this._to_handler(this.fn, this.kind as HandlerKind)
		}

		this._initialized = true

		return this
	}

	_to_handler = <HKind extends HandlerKind>(
		fn: Function,
		kind: HKind,
	): Handler<HKind> => {
		if (fn instanceof Handler) {
			return fn as unknown as Handler<HKind>
		}

		return new Handler<HKind>({
			kind: kind,
			engine: this.server.engine,
			fn: fn as HandlerFunctionByKind[HKind],
		})
	}
}

export default Route
