import type { Msg, NatsConnection, Subscription } from "@nats-io/transport-node"
import type { Route } from "linebridge/classes/Route/index"

import { connect } from "@nats-io/transport-node"
import { EngineAdaptor } from "linebridge/classes/EngineAdaptor/index"
import { HandlerKind } from "linebridge/classes/Handler/index"
import JSONCodec from "linebridge/classes/Nats/codecs/json"

import { NatsRequest } from "./request"
import { NatsResponse } from "./response"

export class NatsRpcError extends Error {
	constructor(
		message: string,
		readonly code: number = 500,
	) {
		super(message)
		this.name = "NatsRpcError"
	}
}

export class NatsEngine extends EngineAdaptor {
	transport = "nats" as const
	ws = null

	base_headers: Record<string, string> = {}
	registers: Set<Record<string, any>> = new Set()

	connection: NatsConnection | null = null
	codec = new JSONCodec()

	private subscriptions = new Map<string, Subscription>()
	private closing = false

	initialize = async (): Promise<void> => {
		this.closing = false

		const params = this.server.params.nats

		if (!params) {
			throw new Error("nats engine requires params.nats")
		}

		const servers =
			params.url ??
			`nats://${params.address ?? "127.0.0.1"}:${params.port ?? 4222}`

		this.connection = await connect({
			servers,
			user: params.user,
			pass: params.pass,
			token: params.token,
			name: params.name,
			timeout: params.timeout,
		})
	}

	register = (route: Route): void => {
		if (route.kind !== HandlerKind.generic) {
			throw new Error(
				`NATS engine only supports generic routes, received [${route.kind}]`,
			)
		}

		if (!this.connection) {
			throw new Error("NATS engine is not initialized")
		}

		if (!route.path || route.path === "/") {
			throw new Error("NATS route requires a subject path")
		}

		if (!route.handler) {
			throw new Error(`NATS route [${route.path}] has no handler`)
		}

		if (this.subscriptions.has(route.path)) {
			throw new Error(`Duplicate NATS route [${route.path}]`)
		}

		const subscription = this.connection.subscribe(route.path, {
			queue: route.queue,
			callback: (error, message) => {
				if (error) {
					console.error(`[nats] subscription error on [${route.path}]`, error)
					return
				}

				void this.dispatch(route, message)
			},
		})

		this.subscriptions.set(route.path, subscription)
		this.registers.add({ method: "event", path: route.path })
	}

	listen = async (): Promise<void> => {
		const shutdown = async () => {
			if (this.closing) return

			this.closing = true
			await this.server._fireClose()
			process.exit(0)
		}

		process.once("SIGINT", shutdown)
		process.once("SIGTERM", shutdown)
	}

	close = async (): Promise<boolean> => {
		for (const subscription of this.subscriptions.values()) {
			subscription.unsubscribe()
		}

		this.subscriptions.clear()

		const connection = this.connection
		this.connection = null

		if (connection) {
			await connection.drain()
		}

		return true
	}

	register_middleware = (): void => {}

	publish(subject: string, data: unknown): void {
		this.connection?.publish(subject, this.codec.encode(data))
	}

	async request(subject: string, data: unknown, timeout = 10000): Promise<any> {
		if (!this.connection) {
			throw new Error("NATS engine is not initialized")
		}

		const response = await this.connection.request(
			subject,
			this.codec.encode(data),
			{ timeout },
		)

		const payload = this.codec.decode(response.data) as {
			data?: any
			error?: string
			code?: number
		}

		if (payload?.error) {
			throw new NatsRpcError(payload.error, payload.code ?? 500)
		}

		return payload?.data
	}

	private async dispatch(route: Route, message: Msg): Promise<void> {
		let data: unknown = null

		try {
			if (message?.data?.length) {
				data = this.codec.decode(message.data)
			}
		} catch (error) {
			console.error(`[nats] invalid payload on [${route.path}]`, error)

			if (message?.reply) {
				const response = new NatsResponse(message, this.codec)
				response.error("Invalid JSON payload", 400)
			}

			return
		}

		const request = new NatsRequest(message, data)
		const response = new NatsResponse(message, this.codec)

		try {
			const proceed = await this.runMiddlewares(route, request, response)

			if (proceed) {
				await route.handler.asGeneric(request, response, route.ctx)
			}
		} catch (error) {
			console.error(`[nats] handler error on [${route.path}]`, error)

			if (!response.handled) {
				response.error(error)
			}
		}
	}

	private async runMiddlewares(
		route: Route,
		request: NatsRequest,
		response: NatsResponse,
	): Promise<boolean> {
		for (const middleware of route.middlewares ?? []) {
			if (response.handled) return false

			let advanced = false

			await middleware.asGenericMiddleware(request, response, () => {
				advanced = true
			})

			if (!advanced) return false
		}

		return !response.handled
	}
}

export default NatsEngine
