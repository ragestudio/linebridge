const fs = require("fs")

const http = require("http")
const https = require("https")

const io = require("socket.io")

const tokenizer = require("corenode/libs/tokenizer")
const { randomWord } = require("@corenode/utils")

const { serverManifest, outputServerError, internalConsole } = require("./lib")
const InternalConsole = global.InternalInternalConsole = internalConsole

const builtInMiddlewares = []

const HTTPProtocolsInstances = {
    http: http,
    https: https,
}

const HTTPEngines = {
    "hyper-express": () => {
        InternalConsole.warn("Hyper-Express is not fully supported yet")

        const engine = require("hyper-express")
        return new engine.Server()
    },
    "express": () => {
        return require("express")()
    },
}

class Server {
    constructor(params = {}, controllers = [], middlewares = {}) {
        this.params = {
            ...global.DEFAULT_SERVER_PARAMS,
            ...params
        }
        this.controllers = [
            ...controllers
        ]
        this.middlewares = {
            ...middlewares
        }
        this.headers = {
            ...global.DEFAULT_HEADERS,
            ...this.params.headers
        }
        this.endpointsMap = {}

        this.listenPort = this.params.port ?? 3010

        // TODO: Handle HTTPS and WSS
        this.HTTPAddress = `${this.params.protocol}://${global.LOCALHOST_ADDRESS}:${this.listenPort}`
        this.WSAddress = `${this.params.wsProtocol}://${global.LOCALHOST_ADDRESS}:${this.listenPort}`

        //* set server basics
        // check if engine is supported
        if (typeof HTTPProtocolsInstances[this.params.protocol].createServer !== "function") {
            throw new Error("Invalid HTTP protocol (Missing createServer function)")
        }

        this.engineInstance = global.engineInstance = HTTPEngines[this.params.httpEngine]()
        this.httpInstance = global.httpInstance = HTTPProtocolsInstances[this.params.protocol].createServer({
            ...this.params.httpOptions ?? {},
        }, this.engineInstance)
        this.wsInterface = global.wsInterface = {
            io: new io.Server(this.httpInstance),
            map: {},
            eventsChannels: [],
        }

        //? check if origin.server exists
        if (!fs.existsSync(serverManifest.filepath)) {
            serverManifest.create()
        }

        //? check origin.server integrity
        const MANIFEST_DATA = global.MANIFEST_DATA = serverManifest.get()
        const MANIFEST_STAT = global.MANIFEST_STAT = serverManifest.stat()

        if (typeof MANIFEST_DATA.created === "undefined") {
            InternalConsole.warn("Server generation file not contains an creation date")
            serverManifest.write({ created: Date.parse(MANIFEST_STAT.birthtime) })
        }

        if (typeof MANIFEST_DATA.serverToken === "undefined") {
            InternalConsole.warn("Missing server token!")
            serverManifest.create()
        }

        this.id = this.params.id ?? randomWord.generate() ?? "unavailable"
        this.usid = tokenizer.generateUSID()
        this.oskid = serverManifest.get("serverToken")

        serverManifest.write({ lastStart: Date.now() })

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
        //* set server defined headers
        this.initializeHeaders()

        //* set server defined middlewares
        this.initializeMiddlewares()

        //* register main index endpoint `/`
        await this.registerBaseEndpoints()

        //* register controllers
        await this.initializeControllers()

        // initialize main socket
        this.wsInterface.io.on("connection", this.handleWSClientConnection)

        // initialize http server
        await this.httpInstance.listen(this.listenPort, this.params.listen ?? "0.0.0.0")

        // output server info
        InternalConsole.log(`✅ Server is up and running!`)
        this.OutputServerInfo()

        // handle exit events
        process.on("SIGTERM", this.cleanupProcess)
        process.on("SIGINT", this.cleanupProcess)
    }

    initializeHeaders = () => {
        this.engineInstance.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })
    }

    initializeMiddlewares = () => {
        const useMiddlewares = [...builtInMiddlewares, ...global.DEFAULT_MIDDLEWARES, ...(this.params.middlewares ?? [])]

        useMiddlewares.forEach((middleware) => {
            if (typeof middleware === "function") {
                this.engineInstance.use(middleware)
            }
        })
    }

    initializeControllers = async () => {
        for await (let controller of this.controllers) {
            if (typeof controller !== "function") {
                throw new Error(`Controller must use the controller class!`)
            }

            if (controller.disabled) {
                InternalConsole.warn(`⏩ Controller [${controller.name}] is disabled! Initialization skipped...`)
                continue
            }

            try {
                const ControllerInstance = new controller()

                // get endpoints from controller (ComplexController)
                const HTTPEndpoints = ControllerInstance.getEndpoints()
                const WSEndpoints = ControllerInstance.getWSEndpoints()

                HTTPEndpoints.forEach((endpoint) => {
                    this.registerHTTPEndpoint(endpoint, ...this.resolveMiddlewares(controller.useMiddlewares))
                })

                WSEndpoints.forEach((endpoint) => {
                    this.registerWSEndpoint(endpoint)
                })
            } catch (error) {
                if (!global.silentOutputServerErrors) {
                    outputServerError({
                        message: "Controller initialization failed:",
                        description: error.stack,
                        ref: controller.refName ?? controller.name,
                    })
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
        if (typeof this.engineInstance[endpoint.method] !== "function") {
            throw new Error(`Method [${endpoint.method}] is not supported!`)
        }

        // grab the middlewares
        let middlewares = [...execs]

        if (endpoint.middlewares) {
            middlewares = [...middlewares, ...this.resolveMiddlewares(endpoint.middlewares)]
        }

        // make sure method has root object on endpointsMap
        if (typeof this.endpointsMap[endpoint.method] !== "object") {
            this.endpointsMap[endpoint.method] = {}
        }

        // create model for http interface router
        const routeModel = [endpoint.route, ...middlewares, this.createHTTPRequestHandler(endpoint)]

        // register endpoint to http interface router
        this.engineInstance[endpoint.method](...routeModel)

        // extend to map
        this.endpointsMap[endpoint.method] = {
            ...this.endpointsMap[endpoint.method],
            [endpoint.route]: {
                route: endpoint.route,
                enabled: endpoint.enabled ?? true,
            },
        }
    }

    registerWSEndpoint = (endpoint, ...execs) => {
        endpoint.nsp = endpoint.nsp ?? "/main"

        this.wsInterface.eventsChannels.push([endpoint.nsp, endpoint.on, endpoint.dispatch])

        this.wsInterface.map[endpoint.on] = {
            nsp: endpoint.nsp,
            channel: endpoint.on,
        }
    }

    registerBaseEndpoints() {
        if (this.params.disableBaseEndpoint) {
            InternalConsole.warn("‼️ [disableBaseEndpoint] Base endpoint is disabled! Endpoints mapping will not be available, so linebridge client bridges will not work! ‼️")
            return false
        }

        //* register main index endpoint `/`
        // this is the default endpoint, should return the server info and the map of all endpoints (http & ws)
        this.registerHTTPEndpoint({
            method: "get",
            route: "/",
            fn: (req, res) => {
                return res.json({
                    LINEBRIDGE_SERVER_VERSION: LINEBRIDGE_SERVER_VERSION,
                    id: this.id,
                    usid: this.usid,
                    oskid: this.oskid,
                    requestTime: new Date().getTime(),
                    endpointsMap: this.endpointsMap,
                    wsEndpointsMap: this.wsInterface.map,
                })
            }
        })
    }

    //* resolvers
    resolveMiddlewares = (middlewares) => {
        middlewares = Array.isArray(middlewares) ? middlewares : [middlewares]
        const middlewaresArray = []

        middlewares.forEach((middleware) => {
            if (typeof middleware === "string") {
                if (typeof this.middlewares[middleware] !== "function") {
                    throw new Error(`Middleware ${middleware} not found!`)
                }

                middlewaresArray.push(this.middlewares[middleware])
            }

            if (typeof middleware === "function") {
                middlewaresArray.push(middleware)
            }
        })

        return middlewaresArray
    }

    log = (...args) => {
        if (!this.params.silent) {
            InternalConsole.log(...args)
        }
    }

    cleanupProcess = () => {
        this.log("🛑  Stopping server...")

        if (typeof this.engineInstance.close === "function") {
            this.engineInstance.close()
        }

        this.wsInterface.io.close()

        process.exit(1)
    }

    // handlers
    createHTTPRequestHandler = (endpoint) => {
        return async (req, res) => {
            try {
                // check if endpoint is disabled
                if (!this.endpointsMap[endpoint.method][endpoint.route].enabled) {
                    throw new Error("Endpoint is disabled!")
                }

                // return the returning call of the endpoint function
                return await endpoint.fn(req, res)
            } catch (error) {
                if (typeof this.params.onRouteError === "function") {
                    return this.params.onRouteError(req, res, error)
                } else {
                    if (!global.silentOutputServerErrors) {
                        outputServerError({
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

    handleWSClientConnection = async (client) => {
        client.res = (...args) => {
            client.emit("response", ...args)
        }
        client.err = (...args) => {
            client.emit("responseError", ...args)
        }

        if (typeof this.params.onWSClientConnection === "function") {
            await this.params.onWSClientConnection(client)
        }

        for await (const [nsp, on, dispatch] of this.wsInterface.eventsChannels) {
            client.on(on, async (...args) => {
                try {
                    await dispatch(client, ...args).catch((error) => {
                        client.err({
                            message: error.message,
                        })
                    })
                } catch (error) {
                    client.err({
                        message: error.message,
                    })
                }
            })
        }

        client.on("ping", () => {
            client.emit("pong")
        })

        client.on("disconnect", async () => {
            if (typeof this.params.onWSClientDisconnect === "function") {
                await this.params.onWSClientDisconnect(client)
            }
        })
    }

    // public methods
    OutputServerInfo = () => {
        InternalConsole.log(`🌐 Server info:`)
        InternalConsole.table({
            "ID": this.id,
            "HTTPEngine": this.params.httpEngine,
            "Version": LINEBRIDGE_SERVER_VERSION,
            "WS Protocol": this.params.wsProtocol,
            "Protocol": this.params.protocol,
            "HTTP address": this.HTTPAddress,
            "WS address": this.WSAddress,
            "Listen port": this.listenPort,
        })
    }

    toogleEndpointReachability = (method, route, enabled) => {
        if (typeof this.endpointsMap[method] !== "object") {
            throw new Error(`Cannot toogle endpoint, method [${method}] not set!`)
        }

        if (typeof this.endpointsMap[method][route] !== "object") {
            throw new Error(`Cannot toogle endpoint [${route}], is not registered!`)
        }

        this.endpointsMap[method][route].enabled = enabled ?? !this.endpointsMap[method][route].enabled
    }
}

module.exports = Server