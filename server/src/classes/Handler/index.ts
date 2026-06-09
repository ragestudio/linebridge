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
import type { MiddlewareHandlerFunction } from "./middleware"

export type {
	HttpHandlerFunction,
	WebsocketHandlerFunction,
	MiddlewareHandlerFunction,
}

export enum HandlerKind {
	http = "http",
	ws = "ws",
	middleware = "middleware",
}

export interface HandlerParamsByKind {
	[HandlerKind.http]: {
		kind: HandlerKind.http
		engine: EngineAdaptor
		fn: HttpHandlerFunction
	}
	[HandlerKind.ws]: {
		kind: HandlerKind.ws
		engine: EngineAdaptor
		fn: WebsocketHandlerFunction
	}
	[HandlerKind.middleware]: {
		kind: HandlerKind.middleware
		engine: EngineAdaptor
		fn: MiddlewareHandlerFunction
	}
}

export class Handler<K extends HandlerKind = HandlerKind> {
	_constructed: boolean = false
	static _constructed: boolean = false
	static _class: boolean = true

	kind: K
	engine: EngineAdaptor
	fn: HandlerParamsByKind[K]["fn"]
	params: HandlerParamsByKind[K]

	constructor(params: HandlerParamsByKind[K]) {
		if (!params.engine || !(params.engine instanceof EngineAdaptor)) {
			throw new Error("Missing Handler engine")
		}

		this.engine = params.engine

		if (typeof params.kind !== "string" || !HandlerKind[params.kind]) {
			throw new Error("Missing or Invalid Handler kind")
		}

		this.kind = params.kind as unknown as K

		if (typeof params.fn !== "function") {
			throw new Error("Missing or Invalid Handler function")
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
					return this.executeAsHttp(...(args as [Request, Response]))
				}
				case "ws": {
					return this.executeAsWebsocket(...(args as [Client, any]))
				}
				case "middleware": {
					return this.executeAsMiddleware(
						...(args as [Request, Response, () => void]),
					)
				}
			}
		} catch (exception: any) {
			console.error("Fatal error executing handler: ", exception)
		}
	}

	/**
	 * Executes an HTTP route handler.
	 * If a non-void result is returned and the response hasn't been sent
	 * yet, it is automatically serialized as JSON.
	 * OperationErrors are converted to the appropriate HTTP status code.
	 */
	private async executeAsHttp(req: Request, res: Response): Promise<void> {
		const fn = this.fn as HttpHandlerFunction

		try {
			const result = await fn(req, res, req.ctx)

			// Auto-JSON: if handler returned data and didn't manually end the response.
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

	/**
	 * Executes a middleware function.
	 * Middlewares receive (req, res, next). If next() is never called,
	 * the request pipeline stops at this middleware.
	 */
	private async executeAsMiddleware(
		req: Request,
		res: Response,
		next: () => void,
	): Promise<void> {
		const fn = this.fn as MiddlewareHandlerFunction

		try {
			await fn(req, res, next)
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

	/**
	 * Executes a WebSocket event handler.
	 * WebSocket errors are logged but don't send HTTP responses -
	 * the client is notified via its error/ack channel instead.
	 */
	private async executeAsWebsocket(
		client: Client,
		data?: any,
	): Promise<void> {
		const fn = this.fn as WebsocketHandlerFunction

		try {
			await fn(client, data)
		} catch (error: any) {
			if (error instanceof OperationError) {
				return
			}

			console.error({
				message: "Unhandled websocket error:",
				description: error.stack,
			})
		}
	}
}

export default Handler
