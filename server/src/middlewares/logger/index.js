export default (req, res, next) => {
	const startHrTime = process.hrtime()

	res.on("finish", () => {
		let url = req.url
		const elapsedHrTime = process.hrtime(startHrTime)
		const elapsedTimeInMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6

		res._responseTimeMs = elapsedTimeInMs

		// cut req.url if is too long
		if (url.length > 100) {
			url = url.substring(0, 100) + "..."
		}

		console.log(
			`${req.method} ${res._status_code ?? res.statusCode ?? 200} ${url} ${elapsedTimeInMs}ms`,
		)
	})

	next()
}
