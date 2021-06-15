const uuid = require("uuid")
const os = require("os")
const path = require("path")
const fs = require("fs")
const express = require("express")
const { objectToArrayMap } = require("@corenode/utils")

const SERVER_VERSION = global.SERVER_VERSION = runtime.helpers.getVersion()
const SERVER_GENFILE = "origin.server"
const SERVER_GENFILEPATH = path.resolve(process.cwd(), SERVER_GENFILE)
const IS_DEV = global.IS_DEV = runtime.helpers.isDevMode()

const { Controller } = require("@classes")
const { getLocalEndpoints, fetchController } = require("./lib/helpers")
const nethub = require("./lib/nethub")
const TOKENIZER = require("./lib/tokenizer")

const GEN = {
    stat: () => {
        return fs.lstatSync(SERVER_GENFILEPATH)
    },
    get: (key) => {
        let data = {}
        if (fs.existsSync(SERVER_GENFILEPATH)) {
            data = JSON.parse(fs.readFileSync(SERVER_GENFILEPATH, 'utf8'))
        }

        if (typeof key === "string") {
            return data[key]
        }
        return data
    },
    write: (mutation) => {
        let data = GEN.get()
        data = { ...data, ...mutation }

        GEN.data = data
        return fs.writeFileSync(SERVER_GENFILEPATH, JSON.stringify(data, null, 2), { encoding: "utf-8" })
    },
    create: () => {
        let data = {
            created: Date.now(),
            serverToken: TOKENIZER.generate()
        }

        GEN.write(data)
    },
    file: SERVER_GENFILE,
    filepath: SERVER_GENFILEPATH,
}

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
        this.oid = GEN.get("serverToken")

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
        //? check if origin.server exists
        if (!fs.existsSync(SERVER_GENFILEPATH)) {
            GEN.create()
        }

        //? check origin.server integrity
        const GENDATA = global.GENDATA = GEN.get()
        const GENSTAT = global.GENSTAT = GEN.stat()

        if (typeof GENDATA.created === "undefined") {
            console.warn("Server generation file not contains an creation date")
            GEN.write({ created: Date.parse(GENSTAT.birthtime) })
        }

        if (typeof GENDATA.serverToken === "undefined") {
            console.warn("Missing server token!")
            GEN.create()
        }

        //? set last start
        GEN.write({ lastStart: Date.now() })

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
            nethub.registerOrigin({ entry: "/", oid: this.oid })
            console.log(`✅  Ready on port ${this.params.port}!`)
        })
    }
}

module.exports = { Controller, Server: RequestServer }