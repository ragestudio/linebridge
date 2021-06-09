const express = require("express")
const { objectToArrayMap } = require("@corenode/utils")
const uuid = require("uuid")
const os = require("os")

const { Controller } = require("@@classes")
const { getLocalEndpoints, fetchController } = require("./lib/helpers")
const nethub = require("./lib/nethub")
const SERVER_VERSION = global.SERVER_VERSION = runtime.helpers.getVersion()

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

class RequestServer {
    constructor(params, endpoints, middlewares) {
        this.params = params ?? {}

        // set params jails
        this.routes = []
        this.endpoints = { ...endpoints }
        this.middlewares = [...defaultMiddlewares]
        this.headers = {
            ...defaultHeaders,
            ...this.params.headers
        }

        // process params
        if (typeof middlewares !== "undefined" && Array.isArray(middlewares)) {
            middlewares.forEach((middleware) => {
                this.middlewares.push(middleware)
            })
        }

        // set server basics
        this.httpServer = require("express")()
        this.usid = uuid.v5(os.hostname(), uuid.v4()) // unique session identifier

        this._everyRequest = null
        this._onRequest = {}

        if (typeof this.params.port === "undefined") {
            this.params.port = 3010
        }

        if (this.params.autoInit) {
            this.init()
        }
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
            controller = new Controller(route, controller)
        }

        const endpoint = { method: method, route: route, controller: controller }

        this.routes.push(route)
        this.endpoints[route] = endpoint

        this.httpServer[method.toLowerCase()](route, (req, res, next) => this.httpRequest(req, res, next, endpoint))
    }

    httpRequest = (req, res, next, endpoint) => {
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
        nethub.heartbeat()
        const localEndpoints = getLocalEndpoints()

        this.httpServer.use(express.json())
        this.httpServer.use(express.urlencoded({ extended: true }))

        this.httpServer.use((req, res, next) => {
            objectToArrayMap(this.headers).forEach((entry) => {
                res.setHeader(entry.key, entry.value)
            })

            next()
        })

        if (Array.isArray(this.middlewares)) {
            this.middlewares.forEach((middleware) => {
                this.httpServer.use(middleware)
            })
        }

        if (localEndpoints && Array.isArray(localEndpoints)) {
            localEndpoints.forEach((endpoint) => {
                if (!endpoint || !endpoint.route || !endpoint.controller) {
                    throw new Error(`Invalid endpoint!`)
                }
                try {
                    let { method, route, controller, fn } = endpoint
                    controller = fetchController(controller)

                    if (typeof method === "undefined") {
                        method = "GET"
                    }

                    if (typeof fn === "undefined") {
                        fn = "default"
                    }

                    this.registerEndpoint(method, route, new Controller(route, controller[fn]))
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
                time: new Date().getTime(),
                usid: this.usid,
                originID: this.params.oid ?? "RelicServer",
                version: SERVER_VERSION
            })
        })

        this.registerEndpoint("get", "/map", (req, res) => {
            res.json({
                routes: this.routes
            })
        })

        this.httpServer.listen(this.params.port, () => {
            console.log(`✅  Ready on port ${this.params.port}!`)
        })
    }
}

module.exports = { Controller, Server: RequestServer }