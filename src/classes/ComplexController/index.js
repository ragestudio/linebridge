const { EventEmitter } = require("events")

export default class ComplexController {
    constructor(params) {
        this.params = { ...params }

        this.internalEvents = new EventEmitter()
    }

    getEndpoints() {
        let endpoints = []

        global.VALID_HTTP_METHODS.forEach((httpMethod) => {
            if (typeof this[httpMethod] === "object") {
                const controllerMethods = Object.keys(this[httpMethod])

                controllerMethods.forEach((methodKey) => {
                    const fn = this[httpMethod][methodKey]

                    let endpoint = {
                        method: httpMethod,
                        route: methodKey,
                        middlewares: [],
                        fn: fn,
                    }

                    if (typeof fn === "object") {
                        endpoint.middlewares = fn.middlewares
                        endpoint.fn = fn.fn
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
                return reject(error)
            }
        })
    }
}