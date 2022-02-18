const path = require("path")
const fs = require("fs")
const http = require("nanoexpress")
const net = require("corenode/net")

const packageJSON = require(path.resolve(module.path, "../../package.json"))
global.LINEBRIDGE_SERVER_VERSION = packageJSON.version

const tokenizer = require("corenode/libs/tokenizer")
const { randomWord } = require("@corenode/utils")

const { serverManifest } = require("../lib")

global.LOCALHOST_ADDRESS = net.ip.getHostAddress() ?? "localhost"
global.VALID_HTTP_METHODS = ["get", "post", "put", "patch", "del", "trace", "head", "any", "options", "ws"]
global.DEFAULT_HEADERS = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE, DEL",
    "Access-Control-Allow-Credentials": "true",
}

const defaultMiddlewares = [
    require("@nanoexpress/middleware-body-parser/cjs")(),
    require('cors')({
        "origin": "*",
        "methods": DEFAULT_HEADERS["Access-Control-Allow-Methods"],
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    }),
]

const FixedMethods = {
    "delete": "del",
}

if (process.env.NODE_ENV !== "production") {
    defaultMiddlewares.push(require('morgan')("dev"))
}

class Server {
    constructor(params = {}, controllers = [], middlewares = {}) {
        this.params = { ...params }
        this.controllers = [...controllers]
        this.middlewares = { ...middlewares }
        this.headers = { ...DEFAULT_HEADERS, ...this.params.headers }
        this.endpointsMap = {}

        this.HTTPlistenPort = this.params.port ?? 3010
        this.HTTPAddress = `http://${LOCALHOST_ADDRESS}:${this.HTTPlistenPort}`

        //* set server basics
        this.httpServer = http()

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

        return this
    }

    initialize = async () => {
        this.httpServer.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })

        const useMiddlewares = [...defaultMiddlewares, ...(this.params.middlewares ?? [])]

        useMiddlewares.forEach((middleware) => {
            if (typeof middleware === "function") {
                this.httpServer.use(middleware)
            }
        })

        await this.registerBaseEndpoints()
        await this.initializeControllers()

        await this.httpServer.listen(this.HTTPlistenPort, this.params.listen ?? "0.0.0.0")

        console.log(`✅  Ready on port ${this.HTTPlistenPort}!`)
    }

    initializeControllers = async () => {
        for await (let controller of this.controllers) {
            if (typeof controller !== "function") {
                throw new Error(`Controller must use the controller class!`)
            }

            try {
                const ControllerInstance = new controller()
                const endpoints = ControllerInstance.getEndpoints()

                endpoints.forEach((endpoint) => {
                    this.registerEndpoint(endpoint, ...this.resolveMiddlewares(controller.useMiddlewares))
                })
            } catch (error) {
                console.error(`🆘 [${controller.refName}] Failed to initialize controller: ${error.message}`)
            }
        }
    }

    registerEndpoint = (endpoint, ...execs) => {
        // check and fix method
        endpoint.method = endpoint.method?.toLowerCase() ?? "get"

        if (FixedMethods[endpoint.method]) {
            endpoint.method = FixedMethods[endpoint.method]
        }

        let middlewares = [...execs]

        if (endpoint.middlewares) {
            middlewares = [...middlewares, ...this.resolveMiddlewares(endpoint.middlewares)]
        }

        if (typeof this.endpointsMap[endpoint.method] !== "object") {
            this.endpointsMap[endpoint.method] = {}
        }

        this.endpointsMap[endpoint.method] = {
            ...this.endpointsMap[endpoint.method],
            [endpoint.route]: {
                route: endpoint.route,
            }
        }

        this.httpServer[endpoint.method](endpoint.route, ...middlewares, async (req, res) => {
            try {
                return await endpoint.fn(req, res)
            } catch (error) {
                if (typeof this.params.onRouteError === "function") {
                    return this.params.onRouteError(req, res, error)
                } else {
                    return res.status(500).json({
                        "error": error.message
                    })
                }
            }
        })
    }

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

    registerBaseEndpoints() {
        this.registerEndpoint({
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
                })
            }
        })
    }
}

module.exports = Server