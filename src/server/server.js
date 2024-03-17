import("./patches")

import fs from "node:fs"
import path from "node:path"
import { EventEmitter } from "@foxify/events"

import Endpoint from "./classes/endpoint"

import defaults from "./defaults"

import IPCClient from "./classes/IPCClient"

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
            console.warn("🚧 This version of Linebridge is experimental! 🚧")
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

        this.valid_http_methods = defaults.valid_http_methods

        // fix and fulfill params
        this.params.useMiddlewares = this.params.useMiddlewares ?? []
        this.params.name = this.constructor.refName ?? this.params.refName
        this.params.useEngine = this.constructor.useEngine ?? this.params.useEngine ?? "express"
        this.params.listen_ip = this.constructor.listenIp ?? this.constructor.listen_ip ?? this.params.listen_ip ?? "0.0.0.0"
        this.params.listen_port = this.constructor.listenPort ?? this.constructor.listen_port ?? this.params.listen_port ?? 3000
        this.params.http_protocol = this.params.http_protocol ?? "http"
        this.params.http_address = `${this.params.http_protocol}://${defaults.localhost_address}:${this.params.listen_port}`

        this.params.routesPath = this.constructor.routesPath ?? this.params.routesPath
        this.params.wsRoutesPath = this.constructor.wsRoutesPath ?? this.params.wsRoutesPath

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
        }

        // initialize engine
        this.engine = await loadEngine(this.params.useEngine)

        this.engine = new this.engine(engineParams)

        if (typeof this.engine.init === "function") {
            await this.engine.init(engineParams)
        }

        // create a router map
        if (typeof this.engine.router.map !== "object") {
            this.engine.router.map = {}
        }

        // try to execute onInitialize hook
        if (typeof this.onInitialize === "function") {
            await this.onInitialize()
        }

        // set server defined headers
        this.useDefaultHeaders()

        // set server defined middlewares
        this.useDefaultMiddlewares()

        // register controllers
        await this.initializeControllers()

        // register routes
        await this.initializeRoutes()

        // register main index endpoint `/`
        await this.registerBaseEndpoints()

        // use main router
        await this.engine.app.use(this.engine.router)

        // initialize websocket init hook if needed
        if (typeof this.engine.ws?.initialize == "function") {
            await this.engine.ws.initialize({
                redisInstance: this.redis
            })
        }

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
            ...defaults.useMiddlewares,
        ])

        middlewares.forEach((middleware) => {
            this.engine.app.use(middleware)
        })
    }

    initializeControllers = async () => {
        const controllers = Object.entries(this.controllers)

        for await (let [key, controller] of controllers) {
            if (typeof controller !== "function") {
                throw new Error(`Controller must use the controller class!`)
            }

            if (controller.disabled) {
                console.warn(`⏩ Controller [${controller.name}] is disabled! Initialization skipped...`)
                continue
            }

            try {
                const ControllerInstance = new controller()

                // get endpoints from controller (ComplexController)
                const HTTPEndpoints = ControllerInstance.__get_http_endpoints()
                const WSEndpoints = ControllerInstance.__get_ws_endpoints()

                HTTPEndpoints.forEach((endpoint) => {
                    this.register.http(endpoint, ...this.resolveMiddlewares(controller.useMiddlewares))
                })

                // WSEndpoints.forEach((endpoint) => {
                //     this.registerWSEndpoint(endpoint)
                // })
            } catch (error) {
                console.error(`\n\x1b[41m\x1b[37m🆘 [${controller.refName ?? controller.name}] Controller initialization failed:\x1b[0m ${error.stack} \n`)
            }
        }
    }

    initializeRoutes = async (filePath) => {
        if (!this.params.routesPath) {
            return false
        }

        const scanPath = filePath ?? this.params.routesPath

        const files = fs.readdirSync(scanPath)

        for await (const file of files) {
            const filePath = `${scanPath}/${file}`

            const stat = fs.statSync(filePath)

            if (stat.isDirectory()) {
                await this.initializeRoutes(filePath)

                continue
            } else if (file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".ts") || file.endsWith(".tsx")) {
                let splitedFilePath = filePath.split("/")

                splitedFilePath = splitedFilePath.slice(splitedFilePath.indexOf("routes") + 1)

                const method = splitedFilePath[splitedFilePath.length - 1].split(".")[0].toLocaleLowerCase()

                splitedFilePath = splitedFilePath.slice(0, splitedFilePath.length - 1)

                // parse parametrized routes
                const parametersRegex = /\[([a-zA-Z0-9_]+)\]/g

                splitedFilePath = splitedFilePath.map((route) => {
                    if (route.match(parametersRegex)) {
                        route = route.replace(parametersRegex, ":$1")
                    }

                    route = route.replace("[$]", "*")

                    return route
                })

                let route = splitedFilePath.join("/")

                route = route.replace(".jsx", "")
                route = route.replace(".js", "")
                route = route.replace(".ts", "")
                route = route.replace(".tsx", "")

                if (route.endsWith("/index")) {
                    route = route.replace("/index", "")
                }

                route = `/${route}`

                // import route
                let routeFile = require(filePath)

                routeFile = routeFile.default ?? routeFile

                if (typeof routeFile !== "function") {
                    if (!routeFile.fn) {
                        console.warn(`Missing fn handler in [${method}][${route}]`)
                        continue
                    }

                    if (Array.isArray(routeFile.useContext)) {
                        let contexts = {}

                        for (const context of routeFile.useContext) {
                            contexts[context] = this.contexts[context]
                        }

                        routeFile.contexts = contexts

                        routeFile.fn.bind({ contexts })
                    }
                }

                new Endpoint(
                    this,
                    {
                        route: route,
                        enabled: true,
                        middlewares: routeFile.middlewares,
                        handlers: {
                            [method]: routeFile.fn ?? routeFile,
                        }
                    }
                )

                continue
            }
        }
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
                middlewares = [...middlewares, ...this.resolveMiddlewares(endpoint.middlewares)]
            }

            this.engine.router.map[endpoint.route] = {
                method: endpoint.method,
                path: endpoint.route,
            }

            // register endpoint to http interface router
            this.engine.router[endpoint.method](endpoint.route, ...middlewares, endpoint.fn)
        },
        ws: (endpoint, ...execs) => {
            endpoint.nsp = endpoint.nsp ?? "/main"

            this.websocket_instance.eventsChannels.push([endpoint.nsp, endpoint.on, endpoint.dispatch])

            this.websocket_instance.map[endpoint.on] = {
                nsp: endpoint.nsp,
                channel: endpoint.on,
            }
        },
    }

    async registerBaseEndpoints() {
        if (this.params.disableBaseEndpoint) {
            console.warn("‼️ [disableBaseEndpoint] Base endpoint is disabled! Endpoints mapping will not be available, so linebridge client bridges will not work! ‼️")
            return false
        }

        const scanPath = path.join(__dirname, "baseEndpoints")
        const files = fs.readdirSync(scanPath)

        for await (const file of files) {
            if (file === "index.js") {
                continue
            }

            let endpoint = require(path.join(scanPath, file)).default

            new endpoint(this)
        }
    }

    resolveMiddlewares = (requestedMiddlewares) => {
        const middlewares = {
            ...this.middlewares,
            ...defaults.middlewares,
        }

        requestedMiddlewares = Array.isArray(requestedMiddlewares) ? requestedMiddlewares : [requestedMiddlewares]

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

    // Utilities
    toogleEndpointReachability = (method, route, enabled) => {
        if (typeof this.endpoints_map[method] !== "object") {
            throw new Error(`Cannot toogle endpoint, method [${method}] not set!`)
        }

        if (typeof this.endpoints_map[method][route] !== "object") {
            throw new Error(`Cannot toogle endpoint [${route}], is not registered!`)
        }

        this.endpoints_map[method][route].enabled = enabled ?? !this.endpoints_map[method][route].enabled
    }
}

module.exports = Server