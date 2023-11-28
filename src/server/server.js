const fs = require("fs")
const path = require("path")
const rtengine = require("./classes/RTEngine").default

const tokenizer = require("corenode/libs/tokenizer")
const { serverManifest, internalConsole } = require("./lib")

const pkgjson = require(path.resolve(process.cwd(), "package.json"))

const Engines = {
    "hyper-express": () => {
        console.warn("HyperExpress is not fully supported yet!")

        const engine = require("hyper-express")

        return new engine.Server()
    },
    "express": (params) => {
        const { createServer } = require("node:http")
        const express = require("express")
        const socketio = require("socket.io")

        const app = express()
        const http = createServer(app)

        const io = new socketio.Server(http)
        const ws = new rtengine({
            ...params,
            io: io,
            http: false,
        })

        app.use(express.json())
        app.use(express.urlencoded({ extended: true }))

        return {
            ws,
            http,
            app,
        }
    },
}

class Server {
    constructor(params = {}, controllers = {}, middlewares = {}, headers = {}) {
        // register aliases
        this.params = {
            minimal: false,
            no_brand: false,
            ...global.DEFAULT_SERVER_PARAMS,
            ...params,
        }

        this.controllers = {
            ...controllers
        }
        this.middlewares = {
            ...middlewares.default ?? middlewares,
        }
        this.headers = {
            ...global.DEFAULT_SERVER_HEADERS,
            ...headers
        }

        this.endpoints_map = {}

        // fix and fulfill params
        this.params.listen_ip = this.params.listen_ip ?? "0.0.0.0"
        this.params.listen_port = this.constructor.listen_port ?? this.params.listen_port ?? 3000
        this.params.http_protocol = this.params.http_protocol ?? "http"
        this.params.http_address = `${this.params.http_protocol}://${global.LOCALHOST_ADDRESS}:${this.params.listen_port}`

        this.engine = null

        this.InternalConsole = new internalConsole({
            server_name: this.params.name
        })

        this.initializeManifest()

        // handle silent mode
        global.consoleSilent = this.params.silent

        if (global.consoleSilent) {
            // find morgan middleware and remove it
            const morganMiddleware = global.DEFAULT_MIDDLEWARES.find(middleware => middleware.name === "logger")

            if (morganMiddleware) {
                global.DEFAULT_MIDDLEWARES.splice(global.DEFAULT_MIDDLEWARES.indexOf(morganMiddleware), 1)
            }
        }

        return this
    }

    initialize = async () => {
        if (!this.params.minimal) {
            this.InternalConsole.info(`🚀 Starting server...`)
        }

        // initialize engine
        this.engine = global.engine = Engines[this.params.engine]({
            ...this.params,
            handleAuth: this.handleWsAuth,
            requireAuth: this.constructor.requireWSAuth,
        })

        if (typeof this.onInitialize === "function") {
            await this.onInitialize()
        }

        //* set server defined headers
        this.initializeHeaders()

        //* set server defined middlewares
        this.initializeRequiredMiddlewares()

        //* register controllers
        await this.initializeControllers()

        //* register main index endpoint `/`
        await this.registerBaseEndpoints()

        if (typeof this.engine.ws?.initialize !== "function") {
            console.warn("❌ WebSocket is not supported!")
        } else {
            await this.engine.ws.initialize()
        }

        await this.engine.http.listen(this.params.listen_port)

        this.InternalConsole.info(`✅ Server ready on => ${this.params.listen_ip}:${this.params.listen_port}`)

        if (!this.params.minimal) {
            this.outputServerInfo()
        }
    }

    initializeManifest = () => {
        // check if origin.server exists
        if (!fs.existsSync(serverManifest.filepath)) {
            serverManifest.create()
        }

        // check origin.server integrity
        const MANIFEST_DATA = global.MANIFEST_DATA = serverManifest.get()
        const MANIFEST_STAT = global.MANIFEST_STAT = serverManifest.stat()

        if (typeof MANIFEST_DATA.created === "undefined") {
            this.InternalConsole.warn("Server generation file not contains an creation date")
            serverManifest.write({ created: Date.parse(MANIFEST_STAT.birthtime) })
        }

        if (typeof MANIFEST_DATA.server_token === "undefined") {
            this.InternalConsole.warn("Missing server token!")
            serverManifest.create()
        }

        this.usid = tokenizer.generateUSID()
        this.server_token = serverManifest.get("server_token")

        serverManifest.write({ last_start: Date.now() })
    }

    initializeHeaders = () => {
        this.engine.app.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })
    }

    initializeRequiredMiddlewares = () => {
        const useMiddlewares = [...this.params.useMiddlewares ?? [], ...global.DEFAULT_MIDDLEWARES]

        useMiddlewares.forEach((middleware) => {
            if (typeof middleware === "function") {
                this.engine.app.use(middleware)
            }
        })
    }

    initializeControllers = async () => {
        const controllers = Object.entries(this.controllers)

        for await (let [key, controller] of controllers) {
            if (typeof controller !== "function") {
                throw new Error(`Controller must use the controller class!`)
            }

            if (controller.disabled) {
                this.InternalConsole.warn(`⏩ Controller [${controller.name}] is disabled! Initialization skipped...`)
                continue
            }

            try {
                const ControllerInstance = new controller()

                // get endpoints from controller (ComplexController)
                const HTTPEndpoints = ControllerInstance.__get_http_endpoints()
                const WSEndpoints = ControllerInstance.__get_ws_endpoints()

                HTTPEndpoints.forEach((endpoint) => {
                    this.registerHTTPEndpoint(endpoint, ...this.resolveMiddlewares(controller.useMiddlewares))
                })

                // WSEndpoints.forEach((endpoint) => {
                //     this.registerWSEndpoint(endpoint)
                // })
            } catch (error) {
                if (!global.silentOutputServerErrors) {
                    this.InternalConsole.error(`\n\x1b[41m\x1b[37m🆘 [${controller.refName ?? controller.name}] Controller initialization failed:\x1b[0m ${error.stack} \n`)
                }
            }
        }
    }

    registerHTTPEndpoint = (endpoint, ...execs) => {
        // check and fix method
        endpoint.method = endpoint.method?.toLowerCase() ?? "get"

        if (global.FIXED_HTTP_METHODS[endpoint.method]) {
            endpoint.method = global.FIXED_HTTP_METHODS[endpoint.method]
        }

        // check if method is supported
        if (typeof this.engine.app[endpoint.method] !== "function") {
            throw new Error(`Method [${endpoint.method}] is not supported!`)
        }

        // grab the middlewares
        let middlewares = [...execs]

        if (endpoint.middlewares) {
            middlewares = [...middlewares, ...this.resolveMiddlewares(endpoint.middlewares)]
        }

        // make sure method has root object on endpointsMap
        if (typeof this.endpoints_map[endpoint.method] !== "object") {
            this.endpoints_map[endpoint.method] = {}
        }

        // create model for http interface router
        const routeModel = [endpoint.route, ...middlewares, this.createHTTPRequestHandler(endpoint)]

        // register endpoint to http interface router
        this.engine.app[endpoint.method](...routeModel)

        // extend to map
        this.endpoints_map[endpoint.method] = {
            ...this.endpoints_map[endpoint.method],
            [endpoint.route]: {
                route: endpoint.route,
                enabled: endpoint.enabled ?? true,
            },
        }
    }

    registerWSEndpoint = (endpoint, ...execs) => {
        endpoint.nsp = endpoint.nsp ?? "/main"

        this.websocket_instance.eventsChannels.push([endpoint.nsp, endpoint.on, endpoint.dispatch])

        this.websocket_instance.map[endpoint.on] = {
            nsp: endpoint.nsp,
            channel: endpoint.on,
        }
    }

    registerBaseEndpoints() {
        if (this.params.disableBaseEndpoint) {
            this.InternalConsole.warn("‼️ [disableBaseEndpoint] Base endpoint is disabled! Endpoints mapping will not be available, so linebridge client bridges will not work! ‼️")
            return false
        }

        this.registerHTTPEndpoint({
            method: "get",
            route: "/",
            fn: (req, res) => {
                return res.json({
                    LINEBRIDGE_SERVER_VERSION: LINEBRIDGE_SERVER_VERSION,
                    version: pkgjson.version ?? "unknown",
                    usid: this.usid,
                    requestTime: new Date().getTime(),
                })
            }
        })

        this.registerHTTPEndpoint({
            method: "GET",
            route: "/__http_map",
            fn: (req, res) => {
                return res.json({
                    endpointsMap: this.endpoints_map,
                })
            }
        })
    }

    //* resolvers
    resolveMiddlewares = (requestedMiddlewares) => {
        requestedMiddlewares = Array.isArray(requestedMiddlewares) ? requestedMiddlewares : [requestedMiddlewares]

        const execs = []

        requestedMiddlewares.forEach((middlewareKey) => {
            if (typeof middlewareKey === "string") {
                if (typeof this.middlewares[middlewareKey] !== "function") {
                    throw new Error(`Middleware ${middlewareKey} not found!`)
                }

                execs.push(this.middlewares[middlewareKey])
            }

            if (typeof middlewareKey === "function") {
                execs.push(middlewareKey)
            }
        })

        return execs
    }


    cleanupProcess = () => {
        this.InternalConsole.log("🛑  Stopping server...")

        if (typeof this.engine.app.close === "function") {
            this.engine.app.close()
        }

        this.engine.io.close()
    }

    // handlers
    createHTTPRequestHandler = (endpoint) => {
        return async (req, res) => {
            try {
                // check if endpoint is disabled
                if (!this.endpoints_map[endpoint.method][endpoint.route].enabled) {
                    throw new Error("Endpoint is disabled!")
                }

                // return the returning call of the endpoint function
                return await endpoint.fn(req, res)
            } catch (error) {
                if (typeof this.params.onRouteError === "function") {
                    return this.params.onRouteError(req, res, error)
                } else {
                    if (!global.silentOutputServerErrors) {
                        console.error({
                            message: "Unhandled route error:",
                            description: error.stack,
                            ref: [endpoint.method, endpoint.route].join("|"),
                        })
                    }

                    return res.status(500).json({
                        "error": error.message
                    })
                }
            }
        }
    }

    // public methods
    outputServerInfo = () => {
        this.InternalConsole.table({
            "linebridge_version": LINEBRIDGE_SERVER_VERSION,
            "engine": this.params.engine,
            "address": this.params.http_address,
            "listen_port": this.params.listen_port,
        })
    }

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