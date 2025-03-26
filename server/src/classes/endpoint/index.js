export default class Endpoint {
    constructor(server, params = {}, ctx = {}) {
        this.server = server
        this.params = params
        this.ctx = ctx

        if (!server) {
            throw new Error("Server is not defined")
        }

        this.route = this.route ?? this.constructor.route ?? this.params.route
        this.enabled = this.enabled ?? this.constructor.enabled ?? this.params.enabled ?? true

        this.middlewares = [
            ...this.middlewares ?? [],
            ...this.params.middlewares ?? [],
        ]

        if (this.params.handlers) {
            for (const method of globalThis._linebridge.validHttpMethods) {
                if (typeof this.params.handlers[method] === "function") {
                    this[method] = this.params.handlers[method]
                }
            }
        }

        this.selfRegister()

        if (Array.isArray(this.params.useContexts)) {
            for (const contextRef of this.params.useContexts) {
                this.endpointContext[contextRef] = this.server.contexts[contextRef]
            }
        }

        return this
    }

    endpointContext = {}

    createHandler(fn) {
        fn = fn.bind(this.server)

        return async (req, res) => {
            try {
                const result = await fn(req, res, this.endpointContext)

                if (result) {
                    return res.json(result)
                }
            } catch (error) {
                if (error instanceof OperationError) {
                    return res.status(error.code).json({
                        "error": error.message
                    })
                }

                console.error({
                    message: "Unhandled route error:",
                    description: error.stack,
                })

                return res.status(500).json({
                    "error": error.message
                })
            }
        }
    }

    selfRegister = async () => {
        for await (const method of globalThis._linebridge.validHttpMethods) {
            const methodHandler = this[method]

            if (typeof methodHandler !== "undefined") {
                const fn = this.createHandler(this[method].fn ?? this[method])

                this.server.register.http(
                    {
                        method,
                        route: this.route,
                        middlewares: this.middlewares,
                        fn: fn,
                    },
                )
            }
        }
    }
}