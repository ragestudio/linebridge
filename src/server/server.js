const fs = require("fs")
const path = require("path")

const io = require("socket.io")

const tokenizer = require("corenode/libs/tokenizer")
const { randomWord } = require("@corenode/utils")

const { serverManifest, outputServerError } = require("./lib")

const HTTPEngines = {
    "hyper-express": () => {
        const engine = require("hyper-express")
        return new engine.Server()
    },
    "nano-express": () => {
        // fix delete http method
        global.FIXED_HTTP_METHODS["del"] = "del"
        global.FIXED_HTTP_METHODS["delete"] = "del"

        global.DEFAULT_MIDDLEWARES.push(require("@nanoexpress/middleware-body-parser/cjs")())

        return require("nanoexpress")()
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

        this.WSListenPort = this.params.wsPort ?? 3020
        this.HTTPlistenPort = this.params.port ?? 3010

        // TODO: Handle HTTPS and WSS
        this.HTTPAddress = `http://${global.LOCALHOST_ADDRESS}:${this.HTTPlistenPort}`
        this.WSAddress = `ws://${global.LOCALHOST_ADDRESS}:${this.WSListenPort}`

        //* set server basics
        this.httpInterface = global.httpInterface = HTTPEngines[this.params.httpEngine]()
        this.wsInterface = global.wsInterface = {
            io: new io.Server(this.WSListenPort),
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
            console.warn("Server generation file not contains an creation date")
            serverManifest.write({ created: Date.parse(MANIFEST_STAT.birthtime) })
        }

        if (typeof MANIFEST_DATA.serverToken === "undefined") {
            console.warn("Missing server token!")
            serverManifest.create()
        }

        this.id = this.params.id ?? randomWord.generate() ?? "unavailable"
        this.usid = tokenizer.generateUSID()
        this.oskid = serverManifest.get("serverToken")

        serverManifest.write({ lastStart: Date.now() })

        // patch request model with a middleware
        this.httpInterface.use(async (req, res) => {
            // make sure req has an body and query
            if (typeof req.body === "undefined") {
                req.body = {}
            }
            if (typeof req.query === "undefined") {
                req.query = {}
            }

            // // if server has enabled urlencoded parser, parse the body
            // if (this.params.urlencoded) {
            //     req.body = await req.urlencoded()
            // }
        })

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

        // initialize socket.io
        this.wsInterface.io.on("connection", this.handleWSClientConnection)

        // initialize http server
        await this.httpInterface.listen(this.HTTPlistenPort, this.params.listen ?? "0.0.0.0")

        // output server info
        console.log(`✅ Server is up and running!`)
        this.consoleOutputServerInfo()

        // handle exit events
        process.on("SIGTERM", this.cleanupProcess)
        process.on("SIGINT", this.cleanupProcess)
    }

    initializeHeaders = () => {
        this.httpInterface.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })
    }

    initializeMiddlewares = () => {
        const useMiddlewares = [...global.DEFAULT_MIDDLEWARES, ...(this.params.middlewares ?? [])]

        useMiddlewares.forEach((middleware) => {
            if (typeof middleware === "function") {
                this.httpInterface.use(middleware)
            }
        })
    }

    initializeControllers = async () => {
        for await (let controller of this.controllers) {
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
        if (typeof this.httpInterface[endpoint.method] !== "function") {
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
        this.httpInterface[endpoint.method](...routeModel)

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

    cleanupProcess = () => {
        console.log("🛑  Stopping server...")

        this.httpInterface.close()
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

    handleWSClientConnection = async (socket) => {
        socket.res = (...args) => {
            socket.emit("response", ...args)
        }
        socket.err = (...args) => {
            socket.emit("responseError", ...args)
        }

        if (typeof this.params.onWSClientConnection === "function") {
            await this.params.onWSClientConnection(socket)
        }

        for await (const [nsp, on, dispatch] of this.wsInterface.eventsChannels) {
            socket.on(on, async (...args) => {
                try {
                    await dispatch(socket, ...args).catch((error) => {
                        socket.err({
                            message: error.message,
                        })
                    })
                } catch (error) {
                    socket.err({
                        message: error.message,
                    })
                }
            })
        }

        socket.on("ping", () => {
            socket.emit("pong")
        })

        socket.on("disconnect", async () => {
            if (typeof this.params.onWSClientDisconnect === "function") {
                await this.params.onWSClientDisconnect(socket)
            }
        })
    }

    // public methods
    consoleOutputServerInfo = () => {
        console.log(`🌐 Server info:`)
        console.table({
            "ID": this.id,
            "Version": LINEBRIDGE_SERVER_VERSION,
            "HTTP address": this.HTTPAddress,
            "WS address": this.WSAddress,
            "WS port": this.WSListenPort,
            "HTTP port": this.HTTPlistenPort,
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