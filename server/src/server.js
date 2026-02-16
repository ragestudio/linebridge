import("./patches")

import { EventEmitter } from "@foxify/events"

import { IPCClient } from "./classes/IPC"
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

class Server {
	constructor(params = {}) {
		if (this.isExperimental) {
			console.warn("\n🚧 This version of Linebridge is experimental! 🚧")
			console.warn(`Version: ${Vars.libPkg.version}\n`)
		}

		this.params = {
			...Vars.defaultParams,
			...params,
		}

		// overrides some params with constructor values
		if (typeof this.constructor.refName === "string") {
			this.params.refName = this.constructor.refName
		}

		if (typeof this.constructor.useEngine === "string") {
			this.params.useEngine = this.constructor.useEngine
		}

		if (typeof this.constructor.listenIp === "string") {
			this.params.listenIp = this.constructor.listenIp
		}

		if (
			typeof this.constructor.listenPort === "string" ||
			typeof this.constructor.listenPort === "number"
		) {
			this.params.listenPort = this.constructor.listenPort
		}

		if (typeof this.constructor.websockets === "boolean") {
			this.params.websockets = this.constructor.websockets
		}

		if (typeof this.constructor.bypassCors === "boolean") {
			this.params.bypassCors = this.constructor.bypassCors
		}

		if (typeof this.constructor.baseRoutes === "boolean") {
			this.params.baseRoutes = this.constructor.baseRoutes
		}

		if (typeof this.constructor.routesPath === "string") {
			this.params.routesPath = this.constructor.routesPath
		}

		if (typeof this.constructor.wsRoutesPath === "string") {
			this.params.wsRoutesPath = this.constructor.wsRoutesPath
		}

		if (typeof this.constructor.websockets === "object") {
			this.params.websockets = this.constructor.websockets
		}

		if (typeof this.constructor.useMiddlewares !== "undefined") {
			if (!Array.isArray(this.constructor.useMiddlewares)) {
				this.constructor.useMiddlewares = [
					this.constructor.useMiddlewares,
				]
			}

			this.params.useMiddlewares = this.constructor.useMiddlewares
		}

		global._linebridge = {
			vars: Vars,
			params: this.params,
		}

		return this
	}

	eventBus = new EventEmitter()
	middlewares = {}
	headers = {}
	events = {}
	contexts = {}
	engine = null
	nats = null
	plugins = new Map()

	get hasSSL() {
		if (!this.ssl) {
			return false
		}

		return this.ssl.key && this.ssl.cert
	}

	get isExperimental() {
		return isExperimental()
	}

	run = async () => {
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
			this.nats = global.nats = new NatsAdapter(this, {
				address: this.params.nats?.address || "127.0.0.1",
				port: this.params.nats?.port || 4222,
			})
			await this.nats.initialize()

			console.info("Starting IPC client")
			this.ipc = global.ipc = new IPCClient(this, process)
		}

		// initialize engine
		this.engine = Engines[this.params.useEngine]

		if (!this.engine) {
			throw new Error(`Engine ${this.params.useEngine} not found`)
		}

		// construct engine instance
		// important, pass this instance to the engine constructor
		this.engine = new this.engine(this)

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
		if (typeof this.engine.ws === "object") {
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
		if (typeof this.routes === "object") {
			for (const [route, endpoint] of Object.entries(this.routes)) {
				new Route(this, {
					...endpoint,
					route: route,
					handlers: {
						[endpoint.method.toLowerCase()]: endpoint.fn,
					},
				}).register()
			}
		}

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
		await this.engine.listen()

		// execute afterInitialize hook.
		if (typeof this.afterInitialize === "function") {
			await this.afterInitialize()
		}

		// calculate elapsed time on ms, to fixed 2
		const elapsedHrTime = process.hrtime(startHrTime)
		const elapsedTimeInMs = elapsedHrTime[0] * 1e3 + elapsedHrTime[1] / 1e6

		const lines = [
			`- Tooks: ${elapsedTimeInMs.toFixed(2)}ms`,
			`- Websocket: ${this.engine.ws ? this.engine.ws?.config?.path : "Disabled"}`,
		]

		if (this.engine.SOCKET_PATH) {
			lines.push(`- Socket: ${this.engine.SOCKET_PATH}`)
		} else {
			lines.push(
				`- Url: ${this.hasSSL ? "https" : "http"}://${this.params.listenIp}:${this.params.listenPort}`,
			)
		}

		console.info(`🛰  Server ready!\n \t${lines.join("\n\t")} \n`)
	}

	register = {
		http: (obj) => {
			// check and fix method
			obj.method = obj.method?.toLowerCase() ?? "get"

			if (Vars.fixedHttpMethods[obj.method]) {
				obj.method = Vars.fixedHttpMethods[obj.method]
			}

			// check if method is supported
			if (typeof this.engine.router[obj.method] !== "function") {
				throw new Error(`Method [${obj.method}] is not supported!`)
			}

			// compose the middlewares
			obj.middlewares = composeMiddlewares(
				{ ...this.middlewares, ...Vars.baseMiddlewares },
				obj.middlewares,
				`[${obj.method.toUpperCase()}] ${obj.route}`,
			)

			return this.engine.register(obj)
		},
		ws: (wsEndpointObj) => {},
	}

	_fireClose = () => {
		if (typeof this.onClose === "function") {
			this.onClose()
		}

		if (typeof this.engine.close === "function") {
			this.engine.close()
		}
	}
}

module.exports = Server
