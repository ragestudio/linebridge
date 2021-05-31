const axios = require("axios")

const http = require("http")
const wsServer = require('websocket').server
const wsFrame = require('websocket').frame


class Controller {
    constructor(key, exec, params) {
        this.params = params

        if (typeof exec === "function") {
            this.exec = exec
        }
    }
    
    exec(req, res) {
        res.send(`Im alive!`)
        console.log(`This is an default controller function`)
    }
}

class Server {
    constructor(params) {
        this.params = params ?? {}

        this.endpoints = {}
        this.endpointsAddress = []
        
        this._everyRequest = null
        this._onRequest = {}

        this.httpServer = require("express")()

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
        route = `/${route}`
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

    init() {
        // todo: read endponts.json and itterate

        this.httpServer.listen(3010, () => {
            console.log(`Ready!`)
        })
    }
}

export { Controller, Server }

// create default server
const defServer = new Server({ autoInit: true })




