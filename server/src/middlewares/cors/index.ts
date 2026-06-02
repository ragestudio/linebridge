import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"

const cors: MiddlewareHandlerFunction = async (req, res, next) => {
	if (req.method === "OPTIONS") {
		res.header("Access-Control-Allow-Origin", "*")
		res.header("Access-Control-Allow-Methods", "*")
		res.header("Access-Control-Allow-Headers", "*")
		res.header("Access-Control-Allow-Credentials", "true")

		return res.status(204).end()
	}

	next()
}

export default cors
