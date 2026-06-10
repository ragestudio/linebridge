/**
 * @fileoverview Request/response logging middleware.
 *
 * Logs the HTTP method, status code, URL, and elapsed time for every request
 * after the response finishes. In production (NODE_ENV=production) this middleware
 * is a no-op to avoid logging overhead.
 */

import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"

/** When true, logging is disabled entirely. */
const isProduction = process.env.NODE_ENV === "production"

/** No-op middleware - used as the export in production. */
const noop: MiddlewareHandlerFunction<any, any> = (req, res, next) => next()

/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * @example
 * humanFormatTime(0.5)  // "500µs"
 * humanFormatTime(42)   // "42ms"
 * humanFormatTime(1500) // "1.50s"
 * humanFormatTime(90000) // "1.50m"
 */
function humanFormatTime(ms: number): string {
	if (ms < 1) {
		return Math.round(ms * 1000) + "µs"
	}

	if (ms < 1000) {
		return (ms | 0) === ms ? ms + "ms" : ms.toFixed(2) + "ms"
	}

	if (ms < 60000) {
		const s = ms / 1000
		return (s | 0) === s ? s + "s" : s.toFixed(2) + "s"
	}

	const m = ms / 60000
	return (m | 0) === m ? m + "m" : m.toFixed(2) + "m"
}

/**
 * The actual logger implementation.
 *
 * Captures the request start time and ISO timestamp, then listens for the
 * `finish` event on the response to log the outcome.
 *
 * URLs longer than 100 characters are truncated with "...".
 */
const loggerImpl: MiddlewareHandlerFunction<any, any> = async (
	req,
	res,
	next,
) => {
	const startDate = new Date().toISOString()
	const startTime = performance.now()

	// log after the response has been sent
	res.on("finish", () => {
		let url = req.url

		// truncate long URLs for readability
		if (url.length > 100) {
			url = url.slice(0, 100) + "..."
		}

		const status = res._status_code ?? res.statusCode ?? 200
		const elapsed = performance.now() - startTime

		// defer the actual write so it doesn't block the response
		setImmediate(() => {
			process.stdout.write(
				`[${startDate}] ${req.method} ${status} ${url} ${humanFormatTime(elapsed)}\n`,
			)
		})
	})

	next()
}

/**
 * In production, export a no-op to avoid logging overhead.
 * In development, export the real logger.
 */
export default isProduction ? noop : loggerImpl
