/**
 * The Handler class wraps a user-provided function (route handler,
 * middleware, or WebSocket event handler) and provides a unified
 * execution interface with automatic error handling.
 *
 * Each handler knows its "kind" (http, ws, or middleware), which
 * determines how arguments are passed and how errors are converted
 * to responses.
 */
import { EngineAdaptor } from "../EngineAdaptor"
import OperationError from "../OperationError"
import { Client } from "../RtEngine/classes/client"

import type { Request, Response, HttpHandlerFunction } from "./http"
import type { WebsocketHandlerFunction } from "./websocket"
import type { MiddlewareHandlerFunction, MiddlewareObj } from "./middleware"

export type {
	HttpHandlerFunction,
	WebsocketHandlerFunction,
	MiddlewareHandlerFunction,
	MiddlewareObj,
}

export enum HandlerKind {
	http = "http",
	ws = "ws",
	middleware = "middleware",
	generic = "generic",
}

export interface HandlerFunctionByKind {
	[HandlerKind.http]: HttpHandlerFunction
	[HandlerKind.ws]: WebsocketHandlerFunction
	[HandlerKind.middleware]: MiddlewareHandlerFunction
	[HandlerKind.generic]: Function
}

export interface HandlerParams<
	TKind extends HandlerKind = HandlerKind.generic,
> {
	kind: TKind
	engine: EngineAdaptor
	fn: HandlerFunctionByKind[TKind]
	ctx?: Record<string, any>
}

export class Handler<Kind extends HandlerKind = HandlerKind.generic> {
	_constructed: boolean = false
	static _constructed: boolean = false
	static _class: boolean = true

	kind: Kind
	engine: EngineAdaptor
	params: HandlerParams<Kind>
	fn: HandlerFunctionByKind[Kind]
	ctx?: Record<string, any>

	constructor(params: HandlerParams<Kind>) {
		if (!params.engine || !(params.engine instanceof EngineAdaptor)) {
			throw new Error("Missing Handler engine")
		}

		this.engine = params.engine

		if (typeof params.kind !== "string" || !HandlerKind[params.kind]) {
			throw new Error("Missing or Invalid Handler kind")
		}

		this.kind = params.kind

		if (typeof params.fn !== "function") {
			throw new Error("Missing or Invalid Handler function")
		}

		if (params.ctx) {
			this.ctx = params.ctx
		}

		this.fn = params.fn
		this.params = params
		this._constructed = true
	}

	/**
	 * Dispatches to the correct executor based on handler kind.
	 * Catches all errors to prevent crashes in user code from
	 * bringing down the server.
	 */
	async execute(...args: any) {
		try {
			switch (this.kind) {
				case "http": {
					return this.asHttp(...(args as [Request, Response]))
				}
				case "ws": {
					return this.asWebsocket(
						...(args as [Client, any, typeof this.ctx]),
					)
				}
				case "middleware": {
					return this.asMiddleware(
						...(args as [Request, Response, () => void]),
					)
				}
			}
		} catch (exception: any) {
			console.error("Fatal error executing handler: ", exception)
		}
	}

	async asHttp(req: Request, res: Response): Promise<void> {
		const fn = this.fn as HttpHandlerFunction

		try {
			const result = await fn(req, res, req.ctx)

			if (result && !res.completed) {
				return res.json(result)
			}
		} catch (error: any) {
			if (error instanceof OperationError) {
				return res.status(error.code).json({ error: error.message })
			}

			console.error({
				message: "Unhandled route error:",
				description: error.stack,
			})

			return res.status(500).json({ error: error.message })
		}
	}

	async asMiddleware(
		req: Request,
		res: Response,
		next: () => void,
	): Promise<void> {
		const fn = this.fn as MiddlewareHandlerFunction

		try {
			await fn(req, res, next, this.ctx ?? {})
		} catch (error: any) {
			if (error instanceof OperationError) {
				return res.status(error.code).json({ error: error.message })
			}

			console.error({
				message: "Unhandled middleware error:",
				description: error.stack,
			})

			return res.status(500).json({ error: error.message })
		}
	}

	async asWebsocket(
		client: Client,
		data?: any,
		ctx?: typeof this.ctx,
	): Promise<[any, null | Error]> {
		let result = null
		let error = null

		const fn = this.fn as WebsocketHandlerFunction

		try {
			result = await fn(client, data, ctx ?? this.ctx)
		} catch (err: any) {
			error = err
			console.debug(`[ws] 500 >`, err)
			// if (!(error instanceof OperationError)) {
			// 	console.debug(`[ws] 500 >`, error)
			// }
		}

		return [result, error]
	}

	// async asGeneric() {
	// 	let result = null
	// 	let error = null

	// 	try {
	// 		result = await this.fn()
	// 	} catch (err: any) {
	// 		error = err
	// 		console.debug(`[handler] error >`, err)
	// 		// if (!(error instanceof OperationError)) {
	// 		// 	console.debug(`[ws] 500 >`, error)
	// 		// }
	// 	}
	// }
}

export default Handler
