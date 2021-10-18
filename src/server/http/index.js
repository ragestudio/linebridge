const fs = require("fs")
const http = require("nanoexpress")
const bodyParser = require('body-parser')

const { nanoid } = require("nanoid")
const tokenizer = require("corenode/libs/tokenizer")
const net = require("corenode/net")

const nethub = require("../../lib/nethub")
const { getLocalEndpoints, fetchController, serverManifest } = require("../../lib")
const hostAddress = net.ip.getHostAddress() ?? "localhost"

const defaultMiddlewares = [
    require('cors')(),
    require('morgan')("dev"),
]
const defaultHeaders = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    "Access-Control-Allow-Credentials": "true",
}

const helpers = process.runtime.helpers ?? require('@corenode/helpers')

//* set globals
global.SERVER_VERSION = helpers.getVersion()

const MethodsFix = {
    "delete": "del",
}
const ValidMethods = ["get", "post", "put", "patch", "del", "trace", "head", "any", "options", "ws"]

class Server {
    constructor(params, endpoints, middlewares) {
        this.params = params ?? {}
        this.port = this.params.port ?? 3010

        // handle endpoints && middlewares
        const localEndpoints = getLocalEndpoints()
        if (typeof endpoints !== "undefined" && Array.isArray(endpoints)) {
            this.params.endpoints = [...this.params.endpoints ?? [], ...endpoints]
        }
        if (localEndpoints && Array.isArray(localEndpoints)) {
            this.params.endpoints = [...this.params.endpoints ?? [], ...localEndpoints]
        }

        //* set params jails
        this.endpoints = {}
        this.serverMiddlewares = [...this.params.serverMiddlewares ?? [], ...defaultMiddlewares]
        this.middlewares = { ...this.params.middlewares, ...middlewares }
        this.controllers = { ...this.params.controllers }
        this.headers = { ...defaultHeaders, ...this.params.headers }

        //* set server basics
        this.httpServer = http()

        //* set id's
        this.id = this.params.id ?? process.runtime?.helpers?.getRootPackage()?.name ?? "unavailable"
        this.usid = tokenizer.generateUSID()
        this.oskid = "unloaded"

        this.localOrigin = `http://${hostAddress}:${this.port}`
        this.nethubOrigin = ""

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

        this.reloadOskid()

        this.preInitialization()
        if (this.params.autoInit) {
            this.init()
        }
    }

    reloadOskid() {
        this.oskid = serverManifest.get("serverToken")
    }

    register = (controller) => {
        if (typeof controller === "undefined") {
            console.error(`Invalid endpoint, missing parameters!`)
            return false
        }

        // check and fix method
        controller.method = controller.method?.toLowerCase() ?? "get"
        
        if (MethodsFix[controller.method]) {
            controller.method = MethodsFix[controller.method]
        }

        // validate method
        if (!ValidMethods.includes(controller.method)){
            throw new Error(`Invalid endpoint method: ${controller.method}`)
        }

        // fulfill an undefined fn
        if (typeof controller.fn === "undefined") {
            controller.fn = (req, res, next) => {
                return next()
            }
        }

        // fetchController function if needed
        if (typeof controller.fn === "string") {
            let stack = []
            const resolverKeys = controller.fn.split(".")

            resolverKeys.forEach((key, index) => {
                if (index === 0) {
                    if (typeof this.controllers[key] !== "undefined") {
                        stack.push(this.controllers[key])
                    } else {
                        stack.push(fetchController(key, this.params.controllersPath))
                    }

                } else {
                    stack.push(stack[index - 1][key])
                }


                if (resolverKeys.length === index + 1) {
                    let resolved = stack[index]

                    if (typeof resolved !== "function" && typeof resolved[controller.method] === "function") {
                        resolved = resolved[controller.method]
                    }

                    return controller.fn = resolved
                }
            })
        }

        // extend main fn
        controller._exec = async (req, res, next) => {
            try {
                await controller.fn(req, res, next)
            } catch (error) {
                return res.status(500).json({ error: error.message, endpoint: controller.route })
            }
        }

        // set endpoint registry
        if (typeof this.endpoints[controller.method] === "undefined") {
            this.endpoints[controller.method] = Object()
        }

        this.endpoints[controller.method][controller.route] = controller

        // create routeModel
        const routeModel = [controller.route]

        // query middlewares
        if (typeof controller.middleware !== "undefined") {
            let query = []

            if (typeof controller.middleware === "string") {
                query.push(controller.middleware)
            }
            if (Array.isArray(controller.middleware)) {
                query = controller.middleware
            }

            query.forEach((middleware) => {
                if (typeof this.middlewares[middleware] === "function") {
                    routeModel.push(this.middlewares[middleware])
                }
            })
        }

        // query main endpoint function
        if (typeof controller._exec === "function") {
            routeModel.push(controller._exec)
        }

        // append to router
        this.httpServer[controller.method](...routeModel)
    }

    preInitialization() {
        // set middlewares
        this.httpServer.use(bodyParser.json())
        this.httpServer.use(bodyParser.urlencoded({ extended: true }))

        if (Array.isArray(this.serverMiddlewares)) {
            this.serverMiddlewares.forEach((middleware) => {
                if (typeof middleware === "function") {
                    this.httpServer.use(middleware)
                }
            })
        }

        // set headers
        this.httpServer.use((req, res, next) => {
            req.requestId = nanoid()
            res.setHeader("request_id", req.requestId)
            next()
        })
        this.httpServer.use((req, res, next) => {
            res.removeHeader("X-Powered-By")
            next()
        })
        this.httpServer.use((req, res, next) => {
            Object.keys(this.headers).forEach((key) => {
                res.setHeader(key, this.headers[key])
            })

            next()
        })

        // register root resolver
        this.register({
            method: "get",
            route: "/",
            fn: (req, res) => {
                return res.json({
                    id: this.id,
                    usid: this.usid,
                    oskid: this.oskid,
                    time: new Date().getTime(),
                    version: SERVER_VERSION
                })
            }
        })

        this.register({
            method: "get",
            route: "/map",
            fn: (req, res) => {
                const map = {}

                Object.keys(this.endpoints).forEach((method) => {
                    if (typeof map[method] === "undefined") {
                        map[method] = []
                    }

                    Object.keys(this.endpoints[method]).forEach((route) => {
                        map[method].push({
                            route: route,
                            method: method
                        })
                    })
                })

                return res.json(map)
            }
        })
    }

    init = async () => {
        // write lastStart
        serverManifest.write({ lastStart: Date.now() })

        // load and set endpoints
        if (Array.isArray(this.params.endpoints)) {
            this.params.endpoints.forEach((endpoint, index) => {
                try {
                    // append to server
                    this.register(endpoint)
                } catch (error) {
                    console.error(`🆘 [${endpoint.route}[${index}]] Failed to load endpoint > ${error.message}`)
                    process.runtime.logger.dump(error)
                }
            })
        }

        await this.httpServer.listen(this.port, this.params.listen ?? '0.0.0.0')
        
        //? register to nethub
        if (this.params.onlineNethub) {
            nethub.registerOrigin({ entry: "/", oskid: this.oskid, id: this.id })
        }

        console.log(`✅  Ready on port ${this.port}!`)
    }
}

module.exports = Server