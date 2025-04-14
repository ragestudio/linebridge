import composeMiddlewares from "../utils/composeMiddlewares"
import Vars from "../vars"

export default async (server) => {
	const middlewares = composeMiddlewares(
		{ ...server.middlewares, ...Vars.baseMiddlewares },
		server.params.useMiddlewares,
		"/*",
	)

	middlewares.forEach((middleware) => {
		server.engine.app.use(middleware)
	})
}
