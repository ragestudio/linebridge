import "./global"

import { EventEmitter } from "tseep"

import registerBaseRoutes from "./registers/baseRoutes"
import registerBaseMiddlewares from "./registers/baseMiddlewares"
import registerBaseHeaders from "./registers/baseHeaders"
import registerWebsocketsFileEvents from "./registers/websocketFileEvents"
import registerHttpFileRoutes from "./registers/httpFileRoutes"
import registerGateway from "./registers/gateway"
import registerPlugins from "./registers/plugins"

import isExperimental from "./utils/isExperimental"
import getHostAddress from "./utils/getHostAddress"

import Vars from "./vars"
import Engines from "./engines"
import NatsAdapter from "./classes/Nats/adapter"
import IPC from "./classes/IPC"

import LoggerMiddleware from "./middlewares/logger"
import CorsMiddleware from "./middlewares/cors"

import type { MiddlewareHandlerFunction } from "./classes/Handler/middleware"
import type { WebsocketHandlerFunction } from "./classes/Handler/websocket"
import type { EngineAdaptor } from "./classes/EngineAdaptor"
import type { IPCEvents, ServerPlugin } from "./types"
import { Route, RouteAlike, RouteObject } from "./classes/Route"
import { HandlerKind } from "./classes/Handler"

export interface NatsParams {
	address?: string
	port?: number
}

export interface WebsocketParams {
	enabled: boolean
	path?: string
}

export interface ServerParams {
	/** Name used to identify this server instance (NATS subject prefix, etc.). */
	refName: string
	/** IP address the engine binds to. */
	listenIp: string
	/** Port the engine listens on. */
	listenPort: number
	/** Engine name to load from the engines registry */
	useEngine: string
	/** WebSocket config: boolean false = disabled, object with `enabled: true` = on. */
	websockets: boolean | WebsocketParams
	/** NATS connection params. null = no NATS. */
	nats: NatsParams | null
	/** Register built-in routes (/ and /_map) at startup. */
	baseRoutes: boolean
	/** Filesystem path scanned for HTTP route files. */
	routesPath: string
	/** Filesystem path scanned for WebSocket event files. */
	wsRoutesPath: string
	/** Middlewares to apply globally (by name or function). */
	useMiddlewares: Array<string | MiddlewareHandlerFunction>
	/** Recognized HTTP method names. */
	httpMethods: string[]
}

/** Shape passed to the engine for registering a single HTTP route. */
export interface HttpRegisterObj {
	method: string
	route: string
	filePath?: string
	middlewares?: Array<string | MiddlewareHandlerFunction>
	fn: (req: Request, res: Response) => Promise<void>
}

/** Shape passed to the engine for registering a WebSocket event handler. */
export interface WsRegisterObj {
	event: string
	fn: WebsocketHandlerFunction
}

/** Minimal interface for objects that carry a contexts map (type helper). */
export interface ServerLike {
	contexts: Record<string, any>
}

export type ConstructorParams = Partial<ServerParams>
export type ExtendedServer<T extends Server> = Server & T

export class Server<EngineType = "neo"> {
	// ---- static properties: subclass overrides for default params ----
	// These are read in the constructor and merged into this.params.
	static refName?: string
	static useEngine?: string
	static listenIp?: string
	static listenPort?: string | number
	static websockets?: boolean | WebsocketParams
	static baseRoutes?: boolean
	static routesPath?: string
	static wsRoutesPath?: string
	static useMiddlewares?: Array<string | MiddlewareHandlerFunction>
	static nats?: NatsParams
	// ---- instance properties ----

	/** Resolved server params (defaults merged with constructor arg). */
	params: ServerParams

	/** Built-in contexts injected into every route handler. */
	base_contexts: { server: Server } = {
		server: this,
	}

	/** Built-in middlewares (logger, cors) registered by name. */
	base_middlewares = {
		logs: LoggerMiddleware,
		cors: CorsMiddleware,
	}

	/** User-defined contexts (merged with base_contexts at route init). */
	contexts!: Record<string, any>

	/** User-defined middlewares (merged with base_middlewares at route init). */
	middlewares!: Record<string, MiddlewareHandlerFunction>

	// ---- runtime state ----

	/** Internal event emitter for server-level lifecycle events. */
	eventBus = new EventEmitter()

	/** Extra HTTP headers injected into every response. */
	headers: Record<string, string> = {}

	/** Declared lifecycle event handlers (e.g. "start", "stop"). */
	events: Record<string, (...args: any[]) => void> = {}

	/** Engine instance. */
	engine!: EngineAdaptor

	/** NATS adapter (null unless LB_GATEWAY_SOCKET is set). */
	nats: NatsAdapter | null = null

	/** IPC client (null unless LB_GATEWAY_SOCKET is set). */
	ipc: any = null

	/** Loaded plugins, keyed by name. */
	plugins: Map<string, ServerPlugin> = new Map()

	/** Local IP address resolved at startup. */
	localAddress: string = ""

	/** SSL configuration (key + cert file paths). */
	ssl!: {
		key: string
		cert: string
	}

	// ---- lifecycle hooks (overridden by subclass or set at runtime) ----

	/** Array of async init tasks executed in parallel before onInitialize. */
	initialize?: Array<() => Promise<void>>

	/** Called early in the boot sequence, before route registration. */
	onInitialize?(): Promise<void>

	/** Called after the engine starts listening. */
	afterInitialize?(): Promise<void>

	/** Called when the server is shutting down. */
	onClose?(): void

	// ---- user-defined routes & events ----

	/** HTTP route definitions (class-based, registered at boot). */
	routes!: Record<string, RouteObject<this, any, "http">>

	/** WebSocket event handler map. */
	wsEvents?: Record<string, RouteObject<this, any, "ws">>

	/** IPC event handler map (used with NATS). */
	ipcEvents?: IPCEvents

	/** WebSocket upgrade hook - validate tokens, attach user data. */
	handleWsUpgrade?: (context: any, token: string, res: any) => Promise<void>

	/** WebSocket connection established hook. */
	handleWsConnection?: (socket: any) => Promise<void>

	/** WebSocket disconnection hook. */
	handleWsDisconnect?: (socket: any, client?: any) => Promise<void>

	constructor(params: ConstructorParams = {}) {
		// Warn if running an experimental build.
		if (isExperimental()) {
			console.warn("\n🚧 This version of Linebridge is experimental! 🚧")
			console.warn(`Version: ${Vars.libPkg.version}\n`)
		}

		// Merge user params on top of framework defaults.
		this.params = {
			...Vars.defaultParams,
			...params,
		}

		// Apply static property overrides from the subclass constructor.
		// This lets subclasses set e.g. `static refName = "my-app"` and have
		// it override the default without passing anything to super().
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

		// Stash params and vars globally so plugins and route files can
		// access them without passing the server instance around.
		// @ts-ignore
		global._linebridge = {
			vars: Vars,
			params: this.params,
		}

		return this
	}

	/** Whether the current build is experimental. */
	get experimental(): boolean {
		return isExperimental()
	}

	/** Whether SSL key+cert files are configured and accessible. */
	get hasSSL(): boolean {
		const ssl = (this as any).ssl

		if (!ssl) {
			return false
		}

		return ssl.key && ssl.cert
	}

	/**
	 * Main boot sequence. Called once to start the server.
	 *
	 * Order of operations:
	 * 1. Resolve local address.
	 * 2. Register lifecycle events on the internal EventEmitter.
	 * 3. If LB_GATEWAY_SOCKET is set: start NATS adapter + IPC client.
	 * 4. Load and initialize the engine (uWebSockets.js).
	 * 5. Execute initialize[] tasks in parallel.
	 * 6. Call onInitialize() hook.
	 * 8. Register base headers and middlewares.
	 * 9. Register declared HTTP routes.
	 * 10. Register declared WebSocket events.
	 * 11. Scan filesystem for HTTP route files.
	 * 12. Scan filesystem for WebSocket event files.
	 * 13. Register built-in routes (/ and /_map) if enabled.
	 * 14. Publish to gateway if LB_GATEWAY_SOCKET is set.
	 * 15. Initialize plugins.
	 * 16. Start the engine listening.
	 * 17. Call afterInitialize() hook.
	 * 18. Print startup summary.
	 */
	run = async (): Promise<void> => {
		// Record start time for the startup summary at the end.
		const startHrTime = process.hrtime()

		// Resolve the machine primary non-loopback IPv4 address.
		this.localAddress = getHostAddress()

		// Wire up declared lifecycle events to the internal EventEmitter.
		for (const [eventName, eventHandler] of Object.entries(this.events)) {
			this.eventBus.on(eventName, eventHandler)
		}

		// If running behind the Linebridge Gateway, spin up NATS + IPC.
		if (process.env.LB_GATEWAY_SOCKET) {
			console.info("Starting NATS adapter")
			this.nats = (global as any).nats = new NatsAdapter(this, {
				address: this.params.nats?.address || "127.0.0.1",
				port: this.params.nats?.port || 4222,
			})
			await this.nats.initialize()

			console.info("Starting IPC client")

			if (this.nats.connection) {
				this.ipc = (global as any).ipc = new IPC(
					this,
					this.nats.connection,
				)
			}
		}

		// Load the engine from the registry and construct it.
		this.engine = Engines[this.params.useEngine]

		if (!this.engine) {
			throw new Error(`Engine ${this.params.useEngine} not found`)
		}

		const EngineClass = this.engine as any
		this.engine = new EngineClass(this)

		// Let the engine do its internal setup (SSL, uWS app, etc.).
		if (typeof this.engine.initialize === "function") {
			await this.engine.initialize()
		}

		// Run all user-defined initialize tasks in parallel.
		if (Array.isArray(this.initialize) && this.initialize.length > 0) {
			await Promise.all(
				this.initialize.map(async (task) => await task()),
			).catch((err) => {
				console.error(err)
				process.exit(1)
			})
		}

		// onInitialize fires after engine is ready but before routes are registered.
		// Good place for database connections, config loading, etc.
		if (typeof this.onInitialize === "function") {
			try {
				await this.onInitialize()
			} catch (err) {
				console.error(err)
				process.exit(1)
			}
		}

		// ---- registration phase ----

		// Inject server name + version headers and core middlewares.
		registerBaseHeaders(this)
		registerBaseMiddlewares(this)

		// Register class-defined WebSocket event handlers on the engine's WS layer.
		if (this.engine.ws) {
			if (typeof this.wsEvents === "object") {
				for (const [eventName, definition] of Object.entries(
					this.wsEvents,
				)) {
					this.engine.ws.registerEvent(eventName, definition)
				}
			}
		}

		// Register class-defined HTTP Routes
		if (typeof this.routes === "object") {
			for (const [path, definition] of Object.entries(this.routes)) {
				if (!definition.method) {
					console.warn(
						`Server defined Route [${path}] has no method defined, skipping`,
					)
					continue
				}

				if (!definition.fn) {
					console.warn(
						`Server defined Route [${path}] has no handler defined, skipping`,
					)
					continue
				}

				if (!definition.useContexts) {
					definition.useContexts = []
				}

				if (!definition.useMiddlewares) {
					definition.useMiddlewares = []
				}

				const routeObj = new Route()

				routeObj.kind = HandlerKind.http
				routeObj.path = path
				routeObj.method = definition.method
				routeObj.handler = definition.fn
				routeObj.useContexts =
					definition.useContexts as ContextsKeys<Server>[]
				routeObj.useMiddlewares =
					definition.useMiddlewares as MiddlewaresKeys<Server>[]

				this.engine.register(routeObj)
			}
		}

		// Scan the filesystem for HTTP route files (e.g. routes/users/get.ts).
		await registerHttpFileRoutes(this.params.routesPath, this)

		// Scan the filesystem for WebSocket event files.
		await registerWebsocketsFileEvents(this.params.wsRoutesPath, this)

		// Register built-in routes: / (server info) and /_map (route listing).
		if (this.params.baseRoutes == true) {
			await registerBaseRoutes(this)
		}

		// If running behind the gateway, advertise this services routes to it.
		if (process.env.LB_GATEWAY_SOCKET) {
			console.info("Publishing to Gateway")
			await registerGateway(this)
		}

		// Load and initialize plugins from LINEBRIDGE_PLUGINS env var.
		await registerPlugins(this)

		// ---- start listening ----
		if (this.engine) {
			await this.engine.listen()
		}

		// afterInitialize fires once the server is accepting connections.
		if (typeof this.afterInitialize === "function") {
			await this.afterInitialize()
		}

		// ---- print startup summary ----
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

	register = {
		http: (route: RouteAlike<Server>): void => {
			if (!this.engine) {
				throw new Error("Engine not initialized")
			}

			this.engine.register(route)
		},
		ws: (route: RouteAlike<Server>): void => {
			throw new Error(
				"Functional/Dynamic websocket event register not implemented yet",
			)

			// if (!this.engine) {
			// 	throw new Error("Engine not initialized")
			// }

			//this.engine.register_wsevent(register)
		},
	}

	/**
	 * Graceful shutdown handler. Calls onClose hook, then closes the engine.
	 * Registered on process exit signals (SIGINT, SIGTERM, etc.) by the engine.
	 */
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
