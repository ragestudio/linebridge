import "../../bootloader/index.d.ts"

import { Server } from "../src/index"

import OpenApiPlugin from "../../plugins/openapi/src/index"
import SharedMapPlugin from "../../plugins/shm_map/src/index.js"

import injectTest from "./middlewares/injectTest.js"

export default class ExampleAPI extends Server {
	static useMiddlewares = ["logs"]
	static usePlugins = [OpenApiPlugin, SharedMapPlugin]

	routes: Record<string, any> = {
		// basic route
		"/hi": defineRoute(ExampleAPI)({
			method: "get",
			fn: async (req, res, ctx) => {
				return {
					message: "Hello world",
				}
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
		"/vars": defineRoute(ExampleAPI)({
			method: "get",
			fn: async (req, res, ctx) => {
				return Vars
			},
		}),
	}

	middlewares = {
		injectTest,
		test: async (req: any, res: any, next: any) => {
			console.log("Hi! Im a middleware")
			next()
		},
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
