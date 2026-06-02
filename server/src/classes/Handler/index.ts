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

	private async executeAsHttp(req: Request, res: Response): Promise<void> {
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
