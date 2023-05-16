const fs = require("fs")
const path = require("path")
const http = require("http")
const https = require("https")
const io = require("socket.io")

const pkgjson = require(path.resolve(process.cwd(), "package.json"))

const tokenizer = require("corenode/libs/tokenizer")
const { serverManifest, internalConsole } = require("./lib")

const HTTPProtocolsInstances = {
    http: http,
    https: https,
}

const HTTPEngines = {
    "hyper-express": () => {
        console.warn("HyperExpress is not fully supported yet!")

        const engine = require("hyper-express")
        return new engine.Server()
    },
    "express": () => {
        return require("express")()
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
        this.params.listen_port = this.params.listen_port ?? 3000
        this.params.http_protocol = this.params.http_protocol ?? "http"
        this.params.ws_protocol = this.params.ws_protocol ?? "ws"

        this.params.http_address = `${this.params.http_protocol}://${global.LOCALHOST_ADDRESS}:${this.params.listen_port}`
        this.params.ws_address = `${this.params.ws_protocol}://${global.LOCALHOST_ADDRESS}:${this.params.listen_port}`

        // check if engine is supported
        if (typeof HTTPProtocolsInstances[this.params.http_protocol]?.createServer !== "function") {
            throw new Error("Invalid HTTP protocol (Missing createServer function)")
        }

        // create instances the 3 main instances of the server (Engine, HTTP, WebSocket)
        this.engine_instance = global.engine_instance = HTTPEngines[this.params.engine]()

        this.http_instance = global.http_instance = HTTPProtocolsInstances[this.params.http_protocol].createServer({
            ...this.params.httpOptions ?? {},
        }, this.engine_instance)

        this.websocket_instance = global.websocket_instance = {
            io: new io.Server(this.http_instance),
            map: {},
            eventsChannels: [],
        }

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

        // handle exit events
        process.on("SIGTERM", this.cleanupProcess)
        process.on("SIGINT", this.cleanupProcess)

        return this
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

    initialize = async () => {
        if (!this.params.minimal) {
            this.InternalConsole.info(`🚀 Starting server...`)
        }

        //* set server defined headers
        this.initializeHeaders()

        //* set server defined middlewares
        this.initializeRequiredMiddlewares()

        //* register controllers
        await this.initializeControllers()

        //* register main index endpoint `/`
        await this.registerBaseEndpoints()

        // initialize main socket
        this.websocket_instance.io.on("connection", this.handleWSClientConnection)

        // initialize http server
        await this.http_instance.listen(this.params.listen_port, this.params.listen_ip ?? "0.0.0.0", () => {
            this.InternalConsole.info(`✅ Server ready on => ${this.params.listen_ip}:${this.params.listen_port}`)

            if (!this.params.minimal) {
                this.outputServerInfo()
            }
        })
    }

    initializeHeaders = () => {
        this.engine_instance.use((req, res, next) => {
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
                this.engine_instance.use(middleware)
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

                WSEndpoints.forEach((endpoint) => {
                    this.registerWSEndpoint(endpoint)
                })
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
        if (typeof this.engine_instance[endpoint.method] !== "function") {
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
        this.engine_instance[endpoint.method](...routeModel)

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

        //* register main index endpoint `/`
        // this is the default endpoint, should return the server info and the map of all endpoints (http & ws)
        this.registerHTTPEndpoint({
            method: "get",
            route: "/",
            fn: (req, res) => {
                return res.json({
                    LINEBRIDGE_SERVER_VERSION: LINEBRIDGE_SERVER_VERSION,
                    version: pkgjson.version ?? "unknown",
                    usid: this.usid,
                    requestTime: new Date().getTime(),
                    endpointsMap: this.endpoints_map,
                    wsEndpointsMap: this.websocket_instance.map,
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

        if (typeof this.engine_instance.close === "function") {
            this.engine_instance.close()
        }

        this.websocket_instance.io.close()

        process.exit(1)
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

        for await (const [nsp, on, dispatch] of this.websocket_instance.eventsChannels) {
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
    outputServerInfo = () => {
        this.InternalConsole.table({
            "linebridge_version": LINEBRIDGE_SERVER_VERSION,
            "engine": this.params.engine,
            "http_address": this.params.http_address,
            "websocket_address": this.params.ws_address,
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