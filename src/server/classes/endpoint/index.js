export default class Endpoint {
    constructor(ctx, params = {}) {
        this.ctx = ctx
        this.params = params

        this.route = this.constructor.route ?? this.params.route
        this.enabled = this.constructor.enabled ?? this.params.enabled ?? true

        this.middlewares = [
            ...this.middlewares ?? [],
            ...this.params.middlewares ?? [],
        ]

        if (this.params.handlers) {
            for (const method of this.ctx.valid_http_methods) {
                if (typeof this.params.handlers[method] === "function") {
                    this[method] = this.params.handlers[method]
                }
            }
        }

        this.selfRegister()

        return this
    }

    createHandler(fn) {
        return async (req, res) => {
            try {
                const result = await fn(req, res)

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
        const validMethods = this.ctx.valid_http_methods

        for await (const method of validMethods) {
            const methodHandler = this[method]

            if (typeof methodHandler !== "undefined") {
                const fn = this.createHandler(this[method].fn ?? this[method])

                this.ctx.register.http(
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