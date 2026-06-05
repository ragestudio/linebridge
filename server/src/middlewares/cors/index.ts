/**
 * @fileoverview CORS (Cross-Origin Resource Sharing) middleware.
 *
 * Handles preflight OPTIONS requests by responding with permissive CORS headers
 * and a 204 No Content status. For all other methods, it simply calls `next()`.
 *
 * Not recomended using with Neo Engine, use "base headers" instead for more performance.
 *
 * CORS headers set:
 * - Access-Control-Allow-Origin: *
 * - Access-Control-Allow-Methods: *
 * - Access-Control-Allow-Headers: *
 * - Access-Control-Allow-Credentials: true
 */

import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"

/**
 * CORS middleware handler.
 *
 * On OPTIONS requests: responds with 204 and all CORS allow headers.
 * On all other requests: calls `next()` to continue the middleware chain.
 */
const cors: MiddlewareHandlerFunction = async (req, res, next) => {
	// preflight request — respond immediately with CORS headers
	if (req.method === "OPTIONS") {
		res.header("Access-Control-Allow-Origin", "*")
		res.header("Access-Control-Allow-Methods", "*")
		res.header("Access-Control-Allow-Headers", "*")
		res.header("Access-Control-Allow-Credentials", "true")

		return res.status(204).end()
	}

	// regular request — pass through to the next middleware/route
	next()
}

export default cors
