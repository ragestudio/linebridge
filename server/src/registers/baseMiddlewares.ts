import composeMiddlewares from "../utils/composeMiddlewares"
import Vars from "../vars"
import type Server from "../server"

export default async (server: Server): Promise<void> => {
	const middlewares = composeMiddlewares(
		{ ...server.middlewares, ...Vars.baseMiddlewares },
		server.params.useMiddlewares,
	)

	middlewares.forEach((middleware) => {
		server.engine.register_middleware(middleware)
	})
}
