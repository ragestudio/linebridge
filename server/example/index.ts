import { Server } from "../src"

export default class ExampleAPI extends Server {
	static useMiddlewares = ["logs"]

	routes = {
		// basic route
		"/hi": defineRoute<ExampleAPI>()({
			method: "get",
			fn: async () => {
				return {
					message: "Hello world",
				}
			},
		}),
		// get from context
		"/server_params": defineRoute<ExampleAPI>()({
			method: "get",
			useContexts: ["server"] as const,
			fn: async (req, res, ctx) => {
				return ctx.server.params
			},
		}),
		// use parameters
		"/sum/:value1/:value2": defineRoute<ExampleAPI>()({
			method: "get",
			fn: async (req, res) => {
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
