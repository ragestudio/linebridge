const { EventEmitter } = require("events")

class Controller {
    constructor(params) {
        this.params = { ...params }

        this.internalEvents = new EventEmitter()
    }

    getWSEndpoints() {
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

    getEndpoints() {
        let endpoints = []

        global.VALID_HTTP_METHODS.forEach((httpMethod) => {
            if (typeof this[httpMethod] === "object") {
                const fixedMethod = global.FIXED_HTTP_METHODS[httpMethod]
                const controllerMethods = Object.keys(this[httpMethod])

                controllerMethods.forEach((methodKey) => {
                    const fn = this[httpMethod][methodKey]

                    let endpoint = {
                        method: fixedMethod ?? httpMethod,
                        route: methodKey,
                        middlewares: [],
                        fn: fn,
                    }

                    if (typeof fn === "object") {
                        endpoint.middlewares = fn.middlewares
                        endpoint.fn = fn.fn
                        endpoint.enabled = fn.enabled
                    }

                    endpoint.fn = this.createHandler(endpoint.fn)

                    endpoints.push(endpoint)
                })
            }
        })

        return endpoints
    }

    createHandler = (fn) => {
        return (...args) => new Promise(async (resolve, reject) => {
            try {
                const result = await fn(...args)
                return resolve(result)
            } catch (error) {
                this.internalEvents.emit("requestError", error)
                return reject(error)
            }
        })
    }
}

module.exports = Controller