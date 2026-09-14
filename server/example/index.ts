import { Server } from "../src/index"
import { defineRoute } from "../src/classes/Route/index"
import { defineMiddleware } from "../src/classes/Handler/middleware"

import OpenApiPlugin from "../../plugins/openapi/src/index"
import ShmMapPlugin from "../../plugins/shm_map/build/out/index"

export default class ExampleAPI extends Server {
	static useMiddlewares = ["logs"]
	static usePlugins = [OpenApiPlugin, ShmMapPlugin]

	routes = {
		// basic route
		"/hi": defineRoute(ExampleAPI)({
			method: "get",
			fn: async (req, res, ctx) => {
				return {
					message: "Hello world",
				}
			},
		}),
		"/get_test": defineRoute(ExampleAPI)({
			method: "get",
			useMiddlewares: ["injectTest"],
			fn: async (req, res, ctx) => {
				return req.test
			},
		}),
		// get from context
		"/server_params": defineRoute(ExampleAPI)({
			method: "get",
			useContexts: ["server"],
			fn: async (req, res, ctx) => {
				return ctx.server.params
			},
		}),
		// use parameters
		"/sum/:value1/:value2": defineRoute(ExampleAPI)({
			method: "get",
			fn: async (
				req,
				res,
			): Promise<{ a: number; b: number; result: number }> => {
				req.params.value1 = parseInt(req.params.value1)
				req.params.value2 = parseInt(req.params.value2)

				return {
					a: req.params.value1,
					b: req.params.value2,
					result: req.params.value1 + req.params.value2,
				}
			},
		}),
	}

	middlewares = {
		test: async (req, res, next) => {
			console.log("Hi! Im a middleware")
			next()
		},
		injectTest: defineMiddleware<{ test: string }>()(
			async (req, res, next) => {
				req.test = "im a test!"
				next()
			},
		),
	}

	contexts = {
		sum: (a: number, b: number) => {
			return a + b
		},
	}

	async onInitialize() {
		console.log("Server initialized!")
	}

	async onClose() {
		console.log("Server closed!")
	}
}

Boot(ExampleAPI)
