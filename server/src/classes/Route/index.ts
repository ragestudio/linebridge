import Handler, { HandlerKind, MiddlewareHandlerFunction } from "../Handler"
import parsePathParameters from "../../utils/parsePathParameters"

import type { Server } from "../../server"
import type { HttpHandlerFunction } from "../Handler/http"
import type { WebsocketHandlerFunction } from "../Handler/websocket"
import type { ContextsKeys, MiddlewaresKeys, Contexts } from "../../types"

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
	Child extends Server = Server,
	SelectedCtx extends ContextsKeys<Child> = ContextsKeys<Child>,
	Type extends RouteTypes = "http",
> {
	useMiddlewares?: MiddlewaresKeys<Child>[]
	useContexts?: readonly SelectedCtx[]
	fn: Type extends "ws"
		? WebsocketHandlerFunction<Pick<Contexts<Child>, SelectedCtx>>
		: HttpHandlerFunction<Pick<Contexts<Child>, SelectedCtx>>
}

export function defineRoute<
	Child extends Server,
	Type extends RouteTypes = "http",
>() {
	const define = <
		UseContexts extends readonly ContextsKeys<Child>[] = readonly [],
	>(route: {
		useMiddlewares?: MiddlewaresKeys<Child>[]
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
						: unknown
				>
	}): typeof route => route

	return define
}

export type DefineRoute = typeof defineRoute

export class Route<
	TServer extends Server = Server,
	TContextKeys extends MiddlewaresKeys<TServer>[] =
		MiddlewaresKeys<TServer>[],
> {
	_constructed: boolean = false

	server!: TServer

	kind: HandlerKind = HandlerKind.http
	path: string = "/"
	method: RouteHttpMethods = "get"
	useContexts: ContextsKeys<TServer>[] = []
	useMiddlewares: [] = []
	pathParametersKey: any
	streaming?: any

	middlewares: Handler[] = []
	ctx: Record<string, any> = {}
	handler: Handler | any

	get engine() {
		return this.server.engine
	}

	constructor() {}

	_initialize = (
		server: TServer,
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

		if (!this.handler) {
			throw new Error(`Route [${this.path}] does not have a handler fn`)
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
		if (Array.isArray(this.useContexts)) {
			for (const key of this.useContexts) {
				if (key in allContexts) {
					this.ctx[key] = allContexts[key]
				}
			}
		}

		// register middlewares
		if (Array.isArray(this.useMiddlewares)) {
			for (let key of this.useMiddlewares) {
				if (typeof key !== "string" && typeof key !== "function") {
					console.warn(`invalid typeof use middleware:`, key)
					continue
				}

				let middleware

				// if is a string, lookup on the server
				if (typeof key === "string") {
					middleware = allMiddlewares[key]
				}

				// if is already a fn, just use it
				if (typeof key === "function") {
					middleware = key
				}

				// skip if cannot find a valid fn
				if (typeof middleware !== "function") {
					console.warn(
						`Route [${this.path}] require to use middleware [${key}], but is missing`,
					)
					continue
				}

				middleware = this._to_handler(
					middleware,
					HandlerKind.middleware,
				)

				if (middleware) {
					// push the middleware in that order
					this.middlewares.push(middleware)
				}
			}
		}

		this.handler = this._to_handler(this.handler, HandlerKind.http)
	}

	protected _to_handler = (obj: any, kind: HandlerKind): Handler | null => {
		if (!this.server) {
			return null
		}

		if (obj instanceof Handler) {
			return obj
		}

		switch (kind) {
			case HandlerKind.http:
				return new Handler<HandlerKind.http>({
					kind: HandlerKind.http,
					engine: this.server.engine,
					fn: obj,
				})
			case HandlerKind.middleware:
				return new Handler<HandlerKind.middleware>({
					kind: HandlerKind.middleware,
					engine: this.server.engine,
					fn: obj,
				})
			case HandlerKind.ws:
				return new Handler<HandlerKind.ws>({
					kind: HandlerKind.ws,
					engine: this.server.engine,
					fn: obj,
				})
			default:
				return null
		}
	}
}

export default Route
