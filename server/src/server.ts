import "./global"

import { EventEmitter } from "@foxify/events"

import IPC from "./classes/IPC"
import Route from "./classes/Route"

import registerBaseRoutes from "./registers/baseRoutes"
import registerBaseMiddlewares from "./registers/baseMiddlewares"
import registerBaseHeaders from "./registers/baseHeaders"
import registerWebsocketsFileEvents from "./registers/websocketFileEvents"
import registerHttpFileRoutes from "./registers/httpFileRoutes"
import registerGateway from "./registers/gateway"
import bypassCorsHeaders from "./registers/bypassCorsHeaders"
import registerPlugins from "./registers/plugins"

import isExperimental from "./utils/isExperimental"
import getHostAddress from "./utils/getHostAddress"
import composeMiddlewares from "./utils/composeMiddlewares"

import Vars from "./vars"
import Engines from "./engines"
import NatsAdapter from "./classes/Nats/adapter"

import LoggerMiddleware from "./middlewares/logger"
import CorsMiddleware from "./middlewares/cors"

import type { MiddlewareHandlerFunction } from "./classes/Handler/middleware"
import type { WebsocketHandlerFunction } from "./classes/Handler/websocket"
import type { EngineAdaptor } from "./classes/EngineAdaptor"
import type { IPCEvents, ServerPlugin } from "./types"

export interface NatsParams {
	address?: string
	port?: number
}

export interface WebsocketParams {
	enabled: boolean
	path?: string
}

export interface ServerParams {
	refName: string
	listenIp: string
	listenPort: number
	useEngine: string
	websockets: boolean | WebsocketParams
	nats: NatsParams | null
	bypassCors: boolean
	baseRoutes: boolean
	routesPath: string
	wsRoutesPath: string
	useMiddlewares: Array<string | MiddlewareHandlerFunction>
	httpMethods: string[]
}

export interface HttpRegisterObj {
	method: string
	route: string
	filePath?: string
	middlewares?: Array<string | MiddlewareHandlerFunction>
	fn: (req: Request, res: Response) => Promise<void>
}

export interface WsRegisterObj {
	event: string
	fn: WebsocketHandlerFunction
}

export interface ServerLike {
	contexts: Record<string, any>
}

export type ConstructorParams = Partial<ServerParams>
export type ExtendedServer<T extends Server> = Server & T

export class Server {
	// static properties that subclasses can override
	static refName?: string
	static useEngine?: string
	static listenIp?: string
	static listenPort?: string | number
	static websockets?: boolean | WebsocketParams
	static bypassCors?: boolean
	static baseRoutes?: boolean
	static routesPath?: string
	static wsRoutesPath?: string
	static useMiddlewares?: Array<string | MiddlewareHandlerFunction>

	// instance properties
	params: ServerParams

	base_contexts: { server: Server } = {
		server: this,
	}
	base_middlewares = {
		logs: LoggerMiddleware,
		cors: CorsMiddleware,
	}

	contexts!: Record<string, any>
	middlewares!: Record<string, MiddlewareHandlerFunction>

	eventBus = new EventEmitter()
	headers: Record<string, string> = {}
	events: Record<string, (...args: any[]) => void> = {}
	engine!: EngineAdaptor
	nats: any = null
	ipc: any = null
	plugins: Map<string, ServerPlugin> = new Map()
	localAddress: string = ""
	ssl!: {
		key: string
		cert: string
	}

	// lifecycle hooks - to be overridden by user
	initialize?: Array<() => Promise<void>>
	onInitialize?(): Promise<void>
	afterInitialize?(): Promise<void>
	onClose?(): void

	// user defined routes and ws events
	routes?: Record<string, any>
	wsEvents?: Record<string, WebsocketHandlerFunction>
	ipcEvents?: IPCEvents

	handleWsUpgrade?: (context: any, token: string, res: any) => Promise<void>
	handleWsConnection?: (socket: any) => Promise<void>
	handleWsDisconnect?: (socket: any, client?: any) => Promise<void>

	constructor(params: ConstructorParams = {}) {
		if (isExperimental()) {
			console.warn("\n🚧 This version of Linebridge is experimental! 🚧")
			console.warn(`Version: ${Vars.libPkg.version}\n`)
		}

		this.params = {
			...Vars.defaultParams,
			...params,
		}

		// overrides some params with constructor values
		const ctor = this.constructor as typeof Server

		if (typeof ctor.refName === "string") {
			this.params.refName = ctor.refName
		}

		if (typeof ctor.useEngine === "string") {
			this.params.useEngine = ctor.useEngine
		}

		if (typeof ctor.listenIp === "string") {
			this.params.listenIp = ctor.listenIp
		}

		if (
			typeof ctor.listenPort === "string" ||
			typeof ctor.listenPort === "number"
		) {
			this.params.listenPort = Number(ctor.listenPort)
		}

		if (typeof ctor.websockets === "boolean") {
			this.params.websockets = ctor.websockets
		}

		if (typeof ctor.bypassCors === "boolean") {
			this.params.bypassCors = ctor.bypassCors
		}

		if (typeof ctor.baseRoutes === "boolean") {
			this.params.baseRoutes = ctor.baseRoutes
		}

		if (typeof ctor.routesPath === "string") {
			this.params.routesPath = ctor.routesPath
		}

		if (typeof ctor.wsRoutesPath === "string") {
			this.params.wsRoutesPath = ctor.wsRoutesPath
		}

		if (typeof ctor.websockets === "object") {
			this.params.websockets = ctor.websockets
		}

		if (typeof ctor.useMiddlewares !== "undefined") {
			if (!Array.isArray(ctor.useMiddlewares)) {
				ctor.useMiddlewares = [ctor.useMiddlewares]
			}

			this.params.useMiddlewares = ctor.useMiddlewares
		}

		// @ts-ignore
		global._linebridge = {
			vars: Vars,
			params: this.params,
		}

		return this
	}

	get experimental(): boolean {
		return isExperimental()
	}

	get hasSSL(): boolean {
		const ssl = (this as any).ssl

		if (!ssl) {
			return false
		}

		return ssl.key && ssl.cert
	}

	run = async (): Promise<void> => {
		const startHrTime = process.hrtime()

		// resolve current local private address of the host
		this.localAddress = getHostAddress()

		this.contexts["server"] = this

		// register declared events to eventBus
		for (const [eventName, eventHandler] of Object.entries(this.events)) {
			this.eventBus.on(eventName, eventHandler)
		}

		if (process.env.LB_GATEWAY_SOCKET) {
			console.info("Starting NATS adapter")
			this.nats = (global as any).nats = new NatsAdapter(this, {
				address: this.params.nats?.address || "127.0.0.1",
				port: this.params.nats?.port || 4222,
			})
			await this.nats.initialize()

			console.info("Starting IPC client")
			this.ipc = (global as any).ipc = new IPC(this, this.nats.nats)
		}

		// initialize engine
		this.engine = Engines[this.params.useEngine]

		if (!this.engine) {
			throw new Error(`Engine ${this.params.useEngine} not found`)
		}

		// construct engine instance
		const EngineClass = this.engine as any
		this.engine = new EngineClass(this)

		// fire engine initialization
		if (typeof this.engine.initialize === "function") {
			await this.engine.initialize()
		}

		// if a initialize arrays is defined, execute them in parallel
		if (Array.isArray(this.initialize) && this.initialize.length > 0) {
			await Promise.all(
				this.initialize.map(async (task) => await task()),
			).catch((err) => {
				console.error(err)
				process.exit(1)
			})
		}

		// at this point, we wanna to execute the onInitialize hook,
		// with a simple base context, without any registers extra
		if (typeof this.onInitialize === "function") {
			try {
				await this.onInitialize()
			} catch (err) {
				console.error(err)
				process.exit(1)
			}
		}

		// Now gonna initialize the final steps & registers

		// bypassCors if needed
		if (this.params.bypassCors) {
			bypassCorsHeaders(this)
		}

		// register base headers & middlewares
		registerBaseHeaders(this)
		registerBaseMiddlewares(this)

		// if websocket enabled, lets do some work
		if (this.engine && typeof this.engine.ws === "object") {
			// register declared ws events
			if (typeof this.wsEvents === "object") {
				for (const [eventName, eventHandler] of Object.entries(
					this.wsEvents,
				)) {
					this.engine.ws.events.set(eventName, eventHandler)
				}
			}
		}

		// now, initialize declared routes with Endpoint class
		// if (typeof this.routes === "object") {
		// 	for (const [route, endpoint] of Object.entries(this.routes)) {
		// 		const _route = new Route(this, {
		// 			...endpoint,
		// 			route,
		// 			handlers: {
		// 				[endpoint.method?.toLowerCase() ?? "get"]: endpoint.fn,
		// 			},
		//       })

		// 		route.

		// 		_route._self_register()
		// 	}
		// }

		// register http file routes
		await registerHttpFileRoutes(this.params.routesPath, this)

		// register ws file routes
		await registerWebsocketsFileEvents(this.params.wsRoutesPath, this)

		// register base routes if enabled
		if (this.params.baseRoutes == true) {
			await registerBaseRoutes(this)
		}

		// if gateway socket mode is enabled, send to gateway
		if (process.env.LB_GATEWAY_SOCKET) {
			console.info("Publishing to Gateway")
			await registerGateway(this)
		}

		// initialize plugins
		await registerPlugins(this)

		// listen
		if (this.engine) {
			await this.engine.listen()
		}

		// execute afterInitialize hook.
		if (typeof this.afterInitialize === "function") {
			await this.afterInitialize()
		}

		// calculate elapsed time on ms, to fixed 2
		const elapsedHrTime = process.hrtime(startHrTime)
		const elapsedTimeInMs = elapsedHrTime[0] * 1e3 + elapsedHrTime[1] / 1e6

		const lines = [
			`- Tooks: ${elapsedTimeInMs.toFixed(2)}ms`,
			`- Websocket: ${this.engine?.ws ? this.engine.ws?.config?.path : "Disabled"}`,
		]

		if (this.engine.socket_path) {
			lines.push(`- Socket: ${this.engine.socket_path}`)
		} else {
			lines.push(
				`- Url: ${this.hasSSL ? "https" : "http"}://${this.params.listenIp}:${this.params.listenPort}`,
			)
		}

		console.info(`🛰  Server ready!\n \t${lines.join("\n\t")} \n`)
	}

	// register = {
	// 	http: (register: HttpRegisterObj): void => {
	// 		if (!this.engine) {
	// 			throw new Error("Engine not initialized")
	// 		}

	// 		// check and fix method
	// 		register.method = register.method?.toLowerCase() ?? "get"

	// 		if (Vars.fixedHttpMethods[register.method]) {
	// 			register.method = Vars.fixedHttpMethods[register.method]
	// 		}

	// 		// check if method is supported
	// 		if (typeof this.engine.router[register.method] !== "function") {
	// 			throw new Error(`Method [${register.method}] is not supported!`)
	// 		}

	// 		// compose the middlewares
	// 		register.middlewares = composeMiddlewares(
	// 			{ ...this.middlewares, ...Vars.baseMiddlewares },
	// 			register.middlewares,
	// 			`[${register.method.toUpperCase()}] ${register.route}`,
	// 		)

	// 		return this.engine.register(register)
	// 	},
	// 	ws: (register: WsRegisterObj): void => {
	// 		if (!this.engine) {
	// 			throw new Error("Engine not initialized")
	// 		}
	// 	},
	// }

	_fireClose = (): void => {
		if (typeof this.onClose === "function") {
			this.onClose()
		}

		if (this.engine && typeof this.engine.close === "function") {
			this.engine.close()
		}
	}
}

export default Server
