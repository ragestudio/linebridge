import Endpoint from "../Endpoint"

export default class Route {
	constructor(server, params = {}) {
		if (!server) {
			throw new Error("server is not defined")
		}

		this.server = server
		this.params = {
			route: this.constructor.route ?? "/",
			useContexts: this.constructor.useContexts ?? [],
			useMiddlewares: this.constructor.useMiddlewares ?? [],
			...params,
		}

		if (typeof this.params.handlers === "object") {
			for (const method of global._linebridge.params.httpMethods) {
				if (typeof this.params.handlers[method] !== "function") {
					continue
				}

				this[method] = this.params.handlers[method]
			}
		}

		if (this.server.contexts && Array.isArray(this.params.useContexts)) {
			for (const key of this.params.useContexts) {
				this.ctx[key] = this.server.contexts[key]
			}
		}
	}

	ctx = {}

	register = () => {
		for (const method of global._linebridge.params.httpMethods) {
			if (typeof this[method] === "undefined") {
				continue
			}

			if (!(this[method] instanceof Endpoint)) {
				if (this[method]._class && !this[method]._constructed) {
					this[method] = new this[method](undefined, this.ctx)
				} else {
					this[method] = new Endpoint(this[method], this.ctx)
				}
			}

			this.server.register.http({
				method: method,
				route: this.params.route,
				filePath: this.params.filePath,
				middlewares: this.params.useMiddlewares,
				fn: this[method].handler,
			})
		}
	}
}
