import("./patches")

import fs from "node:fs"
import path from "node:path"
import { EventEmitter } from "@foxify/events"

import defaults from "./defaults"

import IPCClient from "./classes/IPCClient"
import Endpoint from "./classes/endpoint"

import registerBaseEndpoints from "./initializators/registerBaseEndpoints"
import registerWebsocketsEvents from "./initializators/registerWebsocketsEvents"
import registerHttpRoutes from "./initializators/registerHttpRoutes"

async function loadEngine(engine) {
    const enginesPath = path.resolve(__dirname, "engines")

    const selectedEnginePath = path.resolve(enginesPath, engine)

    if (!fs.existsSync(selectedEnginePath)) {
        throw new Error(`Engine ${engine} not found!`)
    }

    return require(selectedEnginePath).default
}

class Server {
    constructor(params = {}, controllers = {}, middlewares = {}, headers = {}) {
        this.isExperimental = defaults.isExperimental ?? false

        if (this.isExperimental) {
            console.warn("\n🚧 This version of Linebridge is experimental! 🚧")
            console.warn(`Version: ${defaults.version}\n`)
        }

        this.params = {
            ...defaults.params,
            ...params.default ?? params,
        }

        this.controllers = {
            ...controllers.default ?? controllers,
        }

        this.middlewares = {
            ...middlewares.default ?? middlewares,
        }

        this.headers = {
            ...defaults.headers,
            ...headers.default ?? headers,
        }

        // fix and fulfill params
        this.params.useMiddlewares = this.params.useMiddlewares ?? []
        this.params.name = this.constructor.refName ?? this.params.refName
        this.params.useEngine = this.constructor.useEngine ?? this.params.useEngine ?? "hyper-express"
        this.params.listen_ip = this.constructor.listenIp ?? this.constructor.listen_ip ?? this.params.listen_ip ?? "0.0.0.0"
        this.params.listen_port = this.constructor.listenPort ?? this.constructor.listen_port ?? this.params.listen_port ?? 3000
        this.params.http_protocol = this.params.http_protocol ?? "http"
        this.params.http_address = `${this.params.http_protocol}://${defaults.localhost_address}:${this.params.listen_port}`
        this.params.enableWebsockets = this.constructor.enableWebsockets ?? this.params.enableWebsockets ?? false
        this.params.ignoreCors = this.constructor.ignoreCors ?? this.params.ignoreCors ?? true

        this.params.routesPath = this.constructor.routesPath ?? this.params.routesPath ?? path.resolve(process.cwd(), "routes")
        this.params.wsRoutesPath = this.constructor.wsRoutesPath ?? this.params.wsRoutesPath ?? path.resolve(process.cwd(), "routes_ws")

        globalThis._linebridge = {
            name: this.params.name,
            useEngine: this.params.useEngine,
            listenIp: this.params.listen_ip,
            listenPort: this.params.listen_port,
            httpProtocol: this.params.http_protocol,
            httpAddress: this.params.http_address,
            enableWebsockets: this.params.enableWebsockets,
            ignoreCors: this.params.ignoreCors,
            routesPath: this.params.routesPath,
            validHttpMethods: defaults.valid_http_methods,
        }

        return this
    }

    engine = null

    events = null

    ipc = null

    ipcEvents = null

    eventBus = new EventEmitter()

    initialize = async () => {
        const startHrTime = process.hrtime()

        // register events
        if (this.events) {
            if (this.events.default) {
                this.events = this.events.default
            }

            for (const [eventName, eventHandler] of Object.entries(this.events)) {
                this.eventBus.on(eventName, eventHandler)
            }
        }

        const engineParams = {
            ...this.params,
            handleWsAuth: this.handleWsAuth,
            handleAuth: this.handleHttpAuth,
            requireAuth: this.constructor.requireHttpAuth,
            refName: this.constructor.refName ?? this.params.refName,
            ssl: this.ssl,
        }

        // initialize engine
        this.engine = await loadEngine(this.params.useEngine)

        this.engine = new this.engine(engineParams)

        if (typeof this.engine.initialize === "function") {
            await this.engine.initialize(engineParams)
        }

        // check if ws events are defined
        if (typeof this.wsEvents !== "undefined") {
            if (!this.engine.ws) {
                console.warn("`wsEvents` detected, but Websockets are not enabled! Ignoring...")
            } else {
                for (const [eventName, eventHandler] of Object.entries(this.wsEvents)) {
                    this.engine.ws.events.set(eventName, eventHandler)
                }
            }
        }

        // try to execute onInitialize hook
        if (typeof this.onInitialize === "function") {
            try {
                await this.onInitialize()
            }
            catch (err) {
                console.error(err)
                process.exit(1)
            }
        }

        // set defaults
        this.useDefaultHeaders()
        this.useDefaultMiddlewares()

        if (this.routes) {
            for (const [route, endpoint] of Object.entries(this.routes)) {
                this.engine.router.map[route] = new Endpoint(
                    this,
                    {
                        ...endpoint,
                        route: route,
                        handlers: {
                            [endpoint.method]: endpoint.fn,
                        },
                    }
                )
            }
        }

        // register http & ws routes
        this.engine = await registerHttpRoutes(this.params.routesPath, this.engine, this)
        this.engine = await registerWebsocketsEvents(this.params.wsRoutesPath, this.engine)

        // register base endpoints if enabled
        if (!this.params.disableBaseEndpoint) {
            await registerBaseEndpoints(this)
        }

        // use main router
        await this.engine.app.use(this.engine.router)

        // if is a linebridge service then initialize IPC Channels
        if (process.env.lb_service) {
            await this.initializeIpc()
        }

        // try to execute beforeInitialize hook.
        if (typeof this.afterInitialize === "function") {
            await this.afterInitialize()
        }

        // listen
        await this.engine.listen(engineParams)

        // calculate elapsed time on ms, to fixed 2
        const elapsedHrTime = process.hrtime(startHrTime)
        const elapsedTimeInMs = elapsedHrTime[0] * 1e3 + elapsedHrTime[1] / 1e6

        console.info(`🛰  Server ready!\n\t - ${this.params.http_protocol}://${this.params.listen_ip}:${this.params.listen_port}  \n\t - Tooks ${elapsedTimeInMs.toFixed(2)}ms`)
    }

    initializeIpc = async () => {
        console.info("🚄 Starting IPC client")

        this.ipc = global.ipc = new IPCClient(this, process)
    }

    useDefaultHeaders = () => {
        this.engine.app.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })
    }

    useDefaultMiddlewares = async () => {
        const middlewares = await this.resolveMiddlewares([
            ...this.params.useMiddlewares,
            ...this.useMiddlewares ?? [],
            ...defaults.useMiddlewares,
        ])

        middlewares.forEach((middleware) => {
            this.engine.app.use(middleware)
        })
    }

    register = {
        http: (endpoint, ..._middlewares) => {
            // check and fix method
            endpoint.method = endpoint.method?.toLowerCase() ?? "get"

            if (defaults.fixed_http_methods[endpoint.method]) {
                endpoint.method = defaults.fixed_http_methods[endpoint.method]
            }

            // check if method is supported
            if (typeof this.engine.router[endpoint.method] !== "function") {
                throw new Error(`Method [${endpoint.method}] is not supported!`)
            }

            // grab the middlewares
            let middlewares = [..._middlewares]

            if (endpoint.middlewares) {
                if (!Array.isArray(endpoint.middlewares)) {
                    endpoint.middlewares = [endpoint.middlewares]
                }

                middlewares = [...middlewares, ...this.resolveMiddlewares(endpoint.middlewares)]
            }

            this.engine.router.map[endpoint.route] = {
                method: endpoint.method,
                path: endpoint.route,
            }

            // register endpoint to http interface router
            this.engine.router[endpoint.method](endpoint.route, ...middlewares, endpoint.fn)
        },
    }

    resolveMiddlewares = (requestedMiddlewares) => {
        const middlewares = {
            ...this.middlewares,
            ...defaults.middlewares,
        }

        if (typeof requestedMiddlewares === "string") {
            requestedMiddlewares = [requestedMiddlewares]
        }

        const execs = []

        requestedMiddlewares.forEach((middlewareKey) => {
            if (typeof middlewareKey === "string") {
                if (typeof middlewares[middlewareKey] !== "function") {
                    throw new Error(`Middleware ${middlewareKey} not found!`)
                }

                execs.push(middlewares[middlewareKey])
            }

            if (typeof middlewareKey === "function") {
                execs.push(middlewareKey)
            }
        })

        return execs
    }
}

module.exports = Server