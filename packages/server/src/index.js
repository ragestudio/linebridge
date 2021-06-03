const axios = require("axios")
const express = require("express")
const { objectToArrayMap } = require("@corenode/utils")
const uuid = require("uuid")

const fs = require("fs")
const path = require("path")

const http = require("http")
const wsServer = require('websocket').server
const wsFrame = require('websocket').frame

const SERVER_VERSION = runtime.helpers.getVersion()

function fetchController(key) {
    try {
        const controllersPath = global.controllersPath ?? path.resolve(process.cwd(), `controllers`)
        const controllerPath = path.join(controllersPath, key)

        if (fs.existsSync(controllerPath)) {
            import(controllerPath)
                .then((controller) => {
                    return controller
                })
        }

    } catch (error) {
        runtime.logger.dump(error)
        console.error(`Failed to load controller [${key}] > ${error.message}`)
    }
}

class Controller {
    constructor(key, exec, params) {
        this.params = params

        if (typeof exec === "function") {
            this.exec = exec
        }
    }

    exec(req, res) {
        res.send(`Im alive!`)

    }
}

class RequestServer {
    constructor(params, endpoints) {
        this.usid = uuid.v4() // unique session identifier
        this.params = params ?? {}

        this.endpoints = { ...endpoints }
        this.endpointsAddress = []
        this.routes = []

        this.headers = {
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
            "Access-Control-Allow-Credentials": "true"
        }

        this._everyRequest = null
        this._onRequest = {}

        this.httpServer = require("express")()

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

        this.routes.push(route)
        this.endpoints[route] = { method: method, route: route, controller: controller }
        this.endpointsAddress.push(this.endpoints[route])

        this.httpServer[method](route, (req, res) => this.httpRequest(req, res, this.endpoints[route]))
    }

    httpRequest = (req, res, endpoint) => {
        const { route, method, controller } = endpoint

        // exec controller
        if (typeof controller.exec === "function") {
            controller.exec(req, res)
        }

        // on events
        if (typeof this._everyRequest === "function") {
            this._everyRequest(req, res)
        }
        if (typeof this._onRequest[route] === "function") {
            this._onRequest[route](req, res)
        }
    }

    getLocalEndpoints = () => {
        try {
            const localEndpointsFile = path.resolve(process.cwd(), `endpoints.json`)
            if (fs.existsSync(localEndpointsFile)) {
                return JSON.parse(fs.readFileSync(localEndpointsFile, 'utf-8'))
            }
            return false
        } catch (error) {
            return false
        }
    }

    init() {
        const localEndpoints = this.getLocalEndpoints()

        this.httpServer.use(express.json())
        this.httpServer.use(express.urlencoded({ extended: true }))

        this.httpServer.use((req, res, next) => {
            objectToArrayMap(this.headers).forEach((entry) => {
                res.setHeader(entry.key, entry.value)
            })

            next()
        })

        if (localEndpoints && Array.isArray(localEndpoints)) {
            localEndpoints.forEach((endpoint) => {
                try {
                    const { method, route, controller } = endpoint
                    fetchController(controller)
                    this.registerEndpoint(method, route, controller)
                } catch (error) {
                    
                }
                
            })
        }

        // register root resolver
        this.registerEndpoint("get", "/", (req, res) => {
            // here server origin resolver
            res.json({
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
            console.log(`Ready on port ${this.params.port}!`)
        })
    }
}

module.exports = { Controller, Server: RequestServer }

// create default server
const defServer = new RequestServer({ autoInit: true })
defServer.onRequest()



