import Handler, { HandlerKind } from "../Handler"
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

export type RouteTypes = "http" | "ws"
export type RouteHttpMethods =
	| "any"
	| "get"
	| "post"
	| "put"
	| "delete"
	| "patch"
	| "options"
	| "head"

export interface RouteObject<
	Child = Server<any>,
	SelectedCtx extends ContextsKeys<Child> = ContextsKeys<Child>,
	Type extends RouteTypes = "http",
	SelectedMw extends MiddlewaresKeys<Child> = MiddlewaresKeys<Child>,
> {
	path?: string
	method?: RouteHttpMethods
	useMiddlewares?: readonly SelectedMw[]
	useContexts?: readonly SelectedCtx[]
	fn: Type extends "ws"
		? WebsocketHandlerFunction<Pick<Contexts<Child>, SelectedCtx>>
		: HttpHandlerFunction<
				Pick<Contexts<Child>, SelectedCtx>,
				ServerRequest<Child> & ExtractReqExt<Child, SelectedMw>,
				ServerResponse<Child> & ExtractResExt<Child, SelectedMw>
			>
}

export function defineRoute<
	Child = Server<any>,
	Type extends RouteTypes = "http",
>(serverClass?: Child) {
	type Req = ServerRequest<Child>
	type Res = ServerResponse<Child>

	const define = <
		const UseContexts extends readonly ContextsKeys<Child>[] = readonly [],
		const UseMiddlewares extends readonly MiddlewaresKeys<Child>[] =
			readonly [],
	>(route: {
		method?: RouteHttpMethods
		useMiddlewares?: UseMiddlewares
		useContexts?: UseContexts
		fn: Type extends "ws"
			? WebsocketHandlerFunction<
					UseContexts extends readonly [any, ...any[]]
						? Pick<Contexts<Child>, UseContexts[number]>
						: unknown
				>
			: HttpHandlerFunction<
					UseContexts extends readonly [any, ...any[]]
						? Pick<Contexts<Child>, UseContexts[number]>
						: unknown,
					Req & ExtractReqExt<Child, UseMiddlewares[number]>,
					Res & ExtractResExt<Child, UseMiddlewares[number]>
				>
	}): typeof route => route

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
	server!: Server<any> & ServerInstance<TServer>

	kind: HandlerKind = HandlerKind.http
	path: string = "/"
	method: RouteHttpMethods = "get"
	useContexts: readonly ContextsKeys<TServer>[] = []
	useMiddlewares: readonly MiddlewaresKeys[] = []
	pathParametersKey: any
	streaming?: any

	_source_file?: string

	middlewares: Handler[] = []
	ctx: Record<string, any> = {}
	handler!: Handler<HandlerKind>
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
			throw new Error(`Route [${this.path}] does not have a handler or fn`)
		}

		this.pathParametersKey = parsePathParameters(this.path)

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
			for (let key of this.useMiddlewares) {
				if (typeof key !== "string" && typeof key !== "function") {
					console.warn(`invalid typeof use middleware:`, key)
					continue
				}

				let middleware
				let middlewareCtx: Record<string, any> | undefined

				// if is a string, lookup on the server
				if (typeof key === "string") {
					middleware = allMiddlewares[key]
				}

				// if is already a fn, just use it
				if (typeof key === "function") {
					middleware = key
				}

				// if middleware is an object with a fn property (MiddlewareObj), extract the fn and resolve contexts
				if (
					middleware &&
					typeof middleware === "object" &&
					typeof middleware.fn === "function"
				) {
					// resolve useContexts for this middleware
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

				const handler = this._to_handler(middleware, HandlerKind.middleware)

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
			this.handler = this._to_handler(this.fn, this.kind)
		}
	}

	_to_handler = (fn: any, kind: HandlerKind): Handler<HandlerKind> => {
		if (fn instanceof Handler) {
			return fn
		}

		switch (kind) {
			case HandlerKind.http:
				return new Handler<HandlerKind.http>({
					kind: HandlerKind.http,
					engine: this.server.engine,
					fn: fn,
				})
			case HandlerKind.middleware:
				return new Handler<HandlerKind.middleware>({
					kind: HandlerKind.middleware,
					engine: this.server.engine,
					fn: fn,
				})
			case HandlerKind.ws:
				return new Handler<HandlerKind.ws>({
					kind: HandlerKind.ws,
					engine: this.server.engine,
					fn: fn,
				})
		}
	}
}

export default Route
