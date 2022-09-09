const axios = require("axios")
const axiosRetry = require("axios-retry")
const camalize = require("@corenode/utils/dist/camalize").default

const { WSInterface } = require("./classes")
const { generateHTTPRequestDispatcher, generateWSRequestDispatcher } = require("./lib")

const FixedMethods = {
    "del": "delete"
}

module.exports = class Bridge {
    constructor(params = {}, events = {}) {
        this.params = params
        this.events = events

        this.origin = this.params.origin
        this.wsOrigin = this.origin.replace(/^http/, "ws")
        this.wsOrigin = this.wsOrigin.replace(/^https/, "wss")

        this.headers = {
            ...this.params.headers,
        }

        this.httpInterface = axios.create({
            baseURL: this.origin,
            headers: this.headers
        })
        this.wsInterface = new WSInterface({
            origin: this.wsOrigin,
            managerOptions: this.params.wsOptions,
            mainSocketOptions: this.params.wsMainSocketOptions,
        })

        this.endpoints = {}
        this.wsEndpoints = {}

        this.wsInterface.sockets.main.on("disconnect", async (...args) => {
            if (typeof this.events.onDisconnect === "function") {
                await this.events.onDisconnect(...args)
            }
        })

        this.wsInterface.sockets.main.on("unauthorized", async (...args) => {
            if (typeof this.events.onUnauthorized === "function") {
                await this.events.onUnauthorized(...args)
            }
        })

        if (this.params.enableRetry) {
            axiosRetry(this.httpInterface, {
                retries: this.params.onFailRetries ?? 1,
                retryDelay: this.params.retryDelay ?? 0,
            })
        }

        return this
    }

    initialize = async () => {
        const instanceManifest = await this.httpInterface.get("/")
            .then((res) => res.data)
            .catch((err) => {
                console.error(err)
                throw new Error(`Could not get endpoints map from server. [${err.message}]`)
            })

        const httpMap = instanceManifest.endpointsMap
        const wsMap = instanceManifest.wsEndpointsMap

        await this.registerHTTPDispatchers(httpMap)
        await this.registerWSDispatchers(wsMap)

        this.wsInterface.manager.open((err) => {
            if (err) {
                console.error(err)
                throw new Error(`Could not open socket manager. [${err.message}]`)
            }

            this.wsInterface.sockets.main.connect()
        })
    }

    handleRequestContext = async () => {
        if (typeof this.params.onRequest === "function") {
            return await this.params.onRequest()
        }

        return false
    }

    handleResponse = async (response) => {
        if (typeof this.params.onResponse === "function") {
            return await this.params.onResponse(response)
        }

        return false
    }

    registerHTTPDispatchers = async (map) => {
        if (typeof map !== "object") {
            console.error("[Bridge] > createHTTPDispatchers > map is not an object")
            return false
        }

        for await (let HttpMethod of Object.keys(map)) {
            HttpMethod = HttpMethod.toLowerCase()

            const fixedMethod = FixedMethods[HttpMethod] ?? HttpMethod

            if (typeof this.endpoints[fixedMethod] !== "object") {
                this.endpoints[fixedMethod] = {}
            }

            Object.keys(map[HttpMethod]).forEach((route) => {
                const tree = route.split("/")
                const hasTree = tree.length >= 1

                let nameKey = route

                // check if has tree
                if (hasTree) {
                    // remove first whitespace item in route index[0]
                    if (tree[0] == "") {
                        tree.shift()
                    }

                    nameKey = camalize(tree.join("_"))
                }

                // if is an blank route, set as index
                if (nameKey == "") {
                    nameKey = "index"
                }

                this.endpoints[fixedMethod][nameKey] = generateHTTPRequestDispatcher(
                    this.httpInterface,
                    fixedMethod,
                    route,
                    this.handleRequestContext,
                    this.handleResponse,
                    this.params.requestHeaders
                )
            })
        }

        return this.endpoints
    }

    registerWSDispatchers = async (map) => {
        if (typeof map !== "object") {
            console.error("[Bridge] > createWSDispatchers > map is not an object")
            return false
        }

        for await (let wsChannel of Object.keys(map)) {
            const endpoint = map[wsChannel]

            endpoint.nsp[0] == "/" ? endpoint.nsp = endpoint.nsp.slice(1) : null
            endpoint.method = endpoint.channel[0] == "/" ? endpoint.channel.slice(1) : endpoint.channel

            this.wsEndpoints[endpoint.method] = generateWSRequestDispatcher(this.wsInterface.sockets[endpoint.nsp ?? "main"], endpoint.channel)
        }
    }
}