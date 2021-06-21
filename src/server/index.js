const fs = require("fs")
const express = require("express")

const { objectToArrayMap } = require("@corenode/utils")
const tokenizer = require("corenode/dist/libs/tokenizer")

const classes = require("../classes")
const nethub = require("../lib/nethub")
const { getLocalEndpoints, fetchController, serverManifest } = require("../lib")

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

        // handle endpoints && middlewares
        const localEndpoints = getLocalEndpoints()
        if (typeof endpoints !== "undefined" && Array.isArray(endpoints)) {
            this.params.endpoints = [...this.params.endpoints ?? [], ...endpoints]
        }
        if (localEndpoints && Array.isArray(localEndpoints)) {
            this.params.endpoints = [...this.params.endpoints ?? [], ...localEndpoints]
        }
        if (typeof middlewares !== "undefined" && Array.isArray(middlewares)) {
            this.params.middlewares = [...this.params.middlewares ?? [], ...middlewares]
        }
        // set default middlewares
        this.params.middlewares = [...this.params.middlewares ?? [], ...defaultMiddlewares]

        //* set params jails
        this.routes = []
        this.endpoints = {}
        this.middlewares = []
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

        if (typeof this.params.port === "undefined") {
            this.params.port = 3010
        }

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

    registerEndpoint(method, route, controller) {
        if (typeof controller === "function") {
            controller = new classes.Controller(route, controller)
        }

        const endpoint = { method: method, route: route, controller: controller }

        this.routes.push(route)
        this.httpServer[method.toLowerCase()](route, (req, res, next) => this.handleRequest(req, res, next, endpoint))
    }

    handleRequest = (req, res, next, endpoint) => {
        const { route, method, controller } = endpoint

        // exec controller
        if (typeof controller.exec === "function") {
            controller.exec(req, res, next)
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

        //* setup server
        this.httpServer.use(express.json())
        this.httpServer.use(express.urlencoded({ extended: true }))
        // set middlewares
        if (Array.isArray(this.params.middlewares)) {
            this.params.middlewares.forEach((middleware) => {
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

        // set endpoints
        if (Array.isArray(this.params.endpoints)) {
            this.params.endpoints.forEach((endpoint) => {
                if (!endpoint || !endpoint.route || !endpoint.controller) {
                    throw new Error(`Invalid endpoint!`)
                }

                // add to endpoints map
                this.endpoints[endpoint.route] = endpoint

                try {
                    let { method, route, controller, fn } = endpoint

                    // check if controller is an already a controller
                    if (typeof controller === "string") {
                        controller = fetchController(controller)
                    }

                    // check if the controller is an default function and transform it into an controller
                    if (typeof controller === "function") {
                        controller = {
                            default: controller
                        }
                    }

                    // fullfill undefined 
                    if (typeof method === "undefined") {
                        method = "GET"
                    }
                    if (typeof fn === "undefined") {
                        fn = "default"
                    }

                    // append to server
                    this.registerEndpoint(method, route, new classes.Controller(route, controller[fn]))
                } catch (error) {
                    runtime.logger.dump(error)
                    console.error(error)
                    console.error(`🆘  Failed to load endpoint > ${error.message}`)
                }
            })
        }

        // register root resolver
        this.registerEndpoint("get", "/", (req, res) => {
            // here server origin resolver
            res.json({
                id: this.id,
                usid: this.usid,
                oskid: this.oskid,
                time: new Date().getTime(),
                version: SERVER_VERSION
            })
        })

        this.registerEndpoint("get", "/map", (req, res) => {
            res.json({
                routes: this.routes
            })
        })

        this.httpServer.listen(this.params.port, () => {
            //? register to nethub
            if (this.params.onlineNethub) {
                nethub.registerOrigin({ entry: "/", oskid: this.oskid, id: this.id })
            }

            console.log(`✅  Ready on port ${this.params.port}!`)
        })
    }
}

module.exports = Server