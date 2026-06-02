import type { MiddlewareHandlerFunction } from "../../classes/Handler/middleware"

const isProduction = process.env.NODE_ENV === "production"

const noop: MiddlewareHandlerFunction<any, any> = async (req, res, next) =>
	next()

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
	res.on("finish", () => {
		let url = req.url

		if (url.length > 100) {
			url = url.slice(0, 100) + "..."
		}

		const status = res._status_code ?? res.statusCode ?? 200

		process.stdout.write(
			`[${req._start_time}] ${req.method} ${status} ${url} ${humanFormatTime(performance.now() - req._start_time_hr)}\n`,
		)
	})

	next()
}

export default isProduction ? noop : loggerImpl
