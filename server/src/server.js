import("./patches")

import { EventEmitter } from "@foxify/events"

import IPCClient from "./classes/IPCClient"
import Route from "./classes/Route"

import registerBaseRoutes from "./registers/baseRoutes"
import registerBaseMiddlewares from "./registers/baseMiddlewares"
import registerBaseHeaders from "./registers/baseHeaders"
import registerWebsocketsFileEvents from "./registers/websocketFileEvents"
import registerHttpFileRoutes from "./registers/httpFileRoutes"
import registerServiceToIPC from "./registers/ipcService"
import bypassCorsHeaders from "./registers/bypassCorsHeaders"

import isExperimental from "./utils/isExperimental"
import getHostAddress from "./utils/getHostAddress"
import composeMiddlewares from "./utils/composeMiddlewares"

import Vars from "./vars"
import Engines from "./engines"

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
				this.constructor.useMiddlewares = [this.constructor.useMiddlewares]
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
	plugins = []

	get hasSSL() {
		if (!this.ssl) {
			return false
		}

		return this.ssl.key && this.ssl.cert
	}

	get isExperimental() {
		return isExperimental()
	}

	initialize = async () => {
		const startHrTime = process.hrtime()

		// resolve current local private address of the host
		this.localAddress = getHostAddress()

		this.contexts["server"] = this

		// register declared events to eventBus
		for (const [eventName, eventHandler] of Object.entries(this.events)) {
			this.eventBus.on(eventName, eventHandler)
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

		// at this point, we wanna to pass to onInitialize hook,
		// a simple base context, without any registers extra

		// fire onInitialize hook
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
				for (const [eventName, eventHandler] of Object.entries(this.wsEvents)) {
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

		// if is a linebridge service, then initialize IPC Channels
		if (process.env.lb_service) {
			console.info("🚄 Starting IPC client")
			this.ipc = global.ipc = new IPCClient(this, process)

			await registerServiceToIPC(this)
		}

		for (const Plugin of this.plugins) {
			const pluginInstance = new Plugin(this)
			await pluginInstance.initialize()
		}

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
			`- Url: ${this.hasSSL ? "https" : "http"}://${this.params.listenIp}:${this.params.listenPort}`,
			`- Websocket: ${this.engine.ws ? this.engine.ws?.config?.path : "Disabled"}`,
			`- Tooks: ${elapsedTimeInMs.toFixed(2)}ms`,
		]

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
