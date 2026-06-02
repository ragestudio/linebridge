import { Server } from "../src"

export default class ExampleAPI extends Server {
	static useMiddlewares = ["logs"]

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
}

Boot(ExampleAPI)
