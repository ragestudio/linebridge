const { EventEmitter } = require("events")
const Endpoint = require("../endpoint")

module.exports = class Controller {
    constructor(params) {
        this.params = { ...params }

        this.internalEvents = new EventEmitter()
    }

    __get_ws_endpoints() {
        if (typeof this.channels !== "object") {
            return []
        }

        const keys = Object.keys(this.channels)

        return keys.map((key) => {
            const dispatch = this.channels[key]

            return {
                on: key,
                dispatch: dispatch,
            }
        })
    }

    __get_http_endpoints() {
        let endpoints = []

        if (!this.httpEndpoints) {
            return endpoints
        }

        global.VALID_HTTP_METHODS.forEach((httpMethodKey) => {
            const endpointsByMethod = this.httpEndpoints[httpMethodKey]

            if (typeof endpointsByMethod !== "object") {
                return
            }

            const fixedMethod = global.FIXED_HTTP_METHODS[httpMethodKey]
            const methodEndpoints = Object.entries(endpointsByMethod)

            for (let [endpointKey, endpoint] of methodEndpoints) {
                // Handle endpoint transformation as an object
                if (typeof endpoint === "object") {
                    const objEndpoint = endpoint

                    endpoint = class extends Endpoint {
                        static method = httpMethodKey
                        static route = objEndpoint.route ?? endpointKey
                        static enabled = objEndpoint.enabled
                        static middlewares = objEndpoint.middlewares

                        constructor(args) {
                            super(args)
                            this.fn = objEndpoint.fn
                            this.onCatch = objEndpoint.onCatch
                            this.customHandler = objEndpoint.customHandler
                        }
                    }
                } else if (typeof endpoint === "function" && typeof endpoint.prototype?.constructor === "undefined") {
                    // Handle endpoint transformation as a function
                    const endpointFn = endpoint

                    endpoint = class extends Endpoint {
                        static method = httpMethodKey
                        static route = endpointKey

                        constructor(args) {
                            super(args)
                            this.fn = endpointFn
                        }
                    }
                }

                // check if endpoint is a class
                if (typeof endpoint !== "function") {
                    throw new Error(`Invalid endpoint. Expected class or object, got ${typeof endpoint}`)
                }

                // check if controller has a static useRoute property
                if (typeof this.constructor.useRoute === "string") {
                    endpoint.route = `${this.constructor.useRoute}${endpoint.route}`
                    endpoint.route = endpoint.route.replace(/\/\//g, "/")
                }

                const endpointInstance = new endpoint()

                const functionHandler = this.__create_default_fn_handler({
                    fn: endpointInstance.fn,
                    onCatch: endpointInstance.onCatch,
                    customHandler: endpointInstance.customHandler,
                })

                const endpointGenerationObject = {
                    method: fixedMethod ?? httpMethodKey,
                    route: endpoint.route,
                    middlewares: endpoint.middlewares,
                    enabled: endpoint.enabled,
                    fn: functionHandler,
                }

                endpoints.push(endpointGenerationObject)
            }
        })

        return endpoints
    }

    __create_default_fn_handler = ({
        fn,
        onCatch,
        customHandler,
    }) => {
        if (typeof customHandler === "function") {
            return customHandler
        }

        return (...args) => new Promise(async (resolve, reject) => {
            try {
                const result = await fn(...args)

                return resolve(result)
            } catch (error) {
                this.internalEvents.emit("request:error", error)

                if (typeof onCatch === "function") {
                    return onCatch(error, ...args)
                }

                return reject(error)
            }
        })
    }
}