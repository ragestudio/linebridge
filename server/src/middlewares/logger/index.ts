import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"

const isProduction = process.env.NODE_ENV === "production"

const noop: MiddlewareHandlerFunction<any, any> = (req, res, next) => next()

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

const loggerImpl: MiddlewareHandlerFunction<any, any> = async (
	req,
	res,
	next,
) => {
	const startDate = new Date().toISOString()
	const startTime = performance.now()

	res.on("finish", () => {
		let url = req.url

		if (url.length > 100) {
			url = url.slice(0, 100) + "..."
		}

		const status = res._status_code ?? res.statusCode ?? 200
		const elapsed = performance.now() - startTime

		setImmediate(() => {
			process.stdout.write(
				`[${startDate}] ${req.method} ${status} ${url} ${humanFormatTime(elapsed)}\n`,
			)
		})
	})

	next()
}

export default isProduction ? noop : loggerImpl
