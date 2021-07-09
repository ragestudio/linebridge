const fs = require("fs")
const express = require("express")

const { objectToArrayMap } = require("@corenode/utils")
const { nanoid } = require("nanoid")
const tokenizer = require("corenode/dist/libs/tokenizer")
const net = require("corenode/dist/net")

const classes = require("../classes")
const nethub = require("../lib/nethub")
const { getLocalEndpoints, fetchController, serverManifest } = require("../lib")
const hostAddress = net.ip.getHostAddress() ?? "localhost"

const defaultMiddlewares = [
    require('cors')(),
    require('morgan')("dev"),
    require('express-fileupload')({
        createParentPath: true
    })
]
const defaultHeaders = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    "Access-Control-Allow-Credentials": "true",
}

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
        this.routes = []
        this.endpoints = {}
        this.serverMiddlewares = [...this.params.serverMiddlewares ?? [], ...defaultMiddlewares]
        this.middlewares = { ...this.params.middlewares }
        this.controllers = { ...this.params.controllers }
        this.headers = { ...defaultHeaders, ...this.params.headers }

        //* set server basics
        this.httpServer = require("express")()

        //* set id's
        this.id = this.params.id ?? runtime.helpers.getRootPackage().name
        this.usid = tokenizer.generateUSID()
        this.oskid = "unloaded"

        //* set events & params
        this._everyRequest = null
        this._onRequest = {}

        this.localOrigin = `http://${hostAddress}:${this.port}`
        this.nethubOrigin = ""

        //? check if origin.server exists
        if (!fs.existsSync(SERVER_MANIFEST_PATH)) {
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

        //? set last start
        this.reloadOskid()

        serverManifest.write({ lastStart: Date.now() })
        if (this.params.autoInit) {
            this.init()
        }
    }

    reloadOskid() {
        this.oskid = serverManifest.get("serverToken")
    }

    everyRequest = (context) => {
        if (typeof context === "function") {
            this._everyRequest = context
        }
    }

    onRequest = (key, context) => {
        if (typeof key === "undefined") {
            return false
        }
        if (typeof context === "function") {
            this._onRequest[key] = context
        }
    }

    registerEndpoint(endpoint) {
        if (typeof endpoint.controller === "function") {
            endpoint.controller = new classes.Controller(endpoint.route, endpoint.controller)
        }

        this.endpoints[endpoint.route] = endpoint
        this.routes.push(endpoint.route)

        this.httpServer[endpoint.method.toLowerCase()](endpoint.route, (req, res, next) => this.handleRequest(req, res, next, endpoint))
    }

    handleRequest = (req, res, next, endpoint) => {
        const { route, controller } = endpoint

        // exec middleware before controller
        if (typeof endpoint.middleware !== "undefined") {
            let query = []

            if (typeof endpoint.middleware === "string") {
                query.push(endpoint.middleware)
            }
            if (Array.isArray(endpoint.middleware)) {
                query = endpoint.middleware
            }

            query.forEach((middleware) => {
                if (typeof this.middlewares[middleware] === "function") {
                    this.middlewares[middleware](req, res, next, endpoint)
                }
            })
        }

        // exec controller
        if (typeof controller.exec === "function") {
            if (!res.headersSent) {
                controller.exec(req, res, next)
            }
        }

        // on events
        if (typeof this._everyRequest === "function") {
            this._everyRequest(req, res, next)
        }
        if (typeof this._onRequest[route] === "function") {
            this._onRequest[route](req, res, next)
        }
    }

    init() {
        //* setup server
        this.httpServer.use(express.json())
        this.httpServer.use(express.urlencoded({ extended: true }))

        // expose information
        this.httpServer.use((req, res, next) => {
            req.requestId = nanoid()
            res.setHeader("request_id", req.requestId)
            next()
        })

        // set middlewares
        if (Array.isArray(this.serverMiddlewares)) {
            this.serverMiddlewares.forEach((middleware) => {
                if (typeof middleware === "function") {
                    this.httpServer.use(middleware)
                }
            })
        }

        // set headers
        this.httpServer.use((req, res, next) => {
            objectToArrayMap(this.headers).forEach((entry) => {
                res.setHeader(entry.key, entry.value)
            })

            next()
        })

        this.httpServer.use((req, res, next) => {
            res.removeHeader("X-Powered-By")
            next()
        })

        // set endpoints
        if (Array.isArray(this.params.endpoints)) {
            this.params.endpoints.forEach((endpoint) => {
                if (!endpoint || !endpoint.route || !endpoint.controller) {
                    throw new Error(`Invalid endpoint!`)
                }

                try {
                    // check if controller is an already a controller
                    if (typeof endpoint.controller === "string") {
                        // check if the controller is already loaded, else try to fetch
                        if (typeof this.controllers[endpoint.controller] !== "undefined") {
                            endpoint.controller = this.controllers[endpoint.controller]
                        } else {
                            endpoint.controller = fetchController(endpoint.controller)
                        }
                    }

                    // check if the controller is an default function and transform it into an controller
                    if (typeof endpoint.controller === "function") {
                        endpoint.controller = {
                            default: endpoint.controller
                        }
                    }

                    // fulfill undefined 
                    if (typeof endpoint.method === "undefined") {
                        endpoint.method = "GET"
                    }
                    if (typeof endpoint.fn === "undefined") {
                        endpoint.fn = "default"
                    }

                    // convert with class
                    endpoint.controller =  new classes.Controller(endpoint.route, endpoint.controller[endpoint.fn])
                   
                    // append to server
                    this.registerEndpoint(endpoint)
                } catch (error) {
                    runtime.logger.dump(error)
                    console.error(error)
                    console.error(`🆘  Failed to load endpoint > ${error.message}`)
                }
            })
        }

        // register root resolver
        this.registerEndpoint({
            method: "get",
            route: "/",
            controller: (req, res) => {
                // here server origin resolver
                res.json({
                    id: this.id,
                    usid: this.usid,
                    oskid: this.oskid,
                    time: new Date().getTime(),
                    version: SERVER_VERSION
                })
            }
        })

        this.registerEndpoint({
            method: "get",
            route: "/map",
            controller: (req, res) => {
                const methods = {}

                this.routes.forEach((route) => {
                    const endpoint = this.endpoints[route] ?? {}

                    if (typeof endpoint.method === "string") {
                        methods[route] = endpoint.method
                    }
                })

                res.json({
                    routes: this.routes,
                    methods: methods
                })
            }
        })

        this.httpServer.listen(this.port, () => {
            //? register to nethub
            if (this.params.onlineNethub) {
                nethub.registerOrigin({ entry: "/", oskid: this.oskid, id: this.id })
            }

            console.log(`✅  Ready on port ${this.port}!`)
        })
    }
}

module.exports = Server