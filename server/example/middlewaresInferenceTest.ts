import { Server } from "../src/index"
import { defineRoute } from "../src/classes/Route/index"
import { defineMiddleware } from "../src/classes/Handler/middleware"

export default class ExampleAPI extends Server {
	static useMiddlewares = ["logs"]

	middlewares = {
		test: async (req, res, next) => {
			console.log("Hi! Im a middleware")
			next()
		},
		testObj: defineMiddleware<{ test: string }, { testRes: number }>()(
			async (req, res, next) => {
				req.test = "123"
				res.testRes = 456
				next()
			},
		),
		anotherObj: defineMiddleware<{ another: boolean }, {}>()(
			async (req, res, next) => {
				req.another = true
				next()
			},
		),
	}

	routes = {
		// basic route
		"/hi": defineRoute<ExampleAPI>()({
			method: "get",
			useMiddlewares: ["testObj", "anotherObj"],
			fn: async (req, res) => {
				console.log("req.test", req.test) // req.test should be "123"

				return {
					message: "Hello world",
					testObj: req.test,
					testRes: res.testRes,
					another: req.another,
				}
			},
		}),
	}

	async onInitialize() {
		console.log("Server initialized!")
	}

	async onClose() {
		console.log("Server closed!")
	}
}

Boot(ExampleAPI)
