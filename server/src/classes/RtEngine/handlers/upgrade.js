export default async function (req, res) {
	try {
		// create connection context with unique id and request data
		const context = {
			id: nanoid(),
			token: req.query.token,
			user: null,
			httpHeaders: req.headers,
		}

		// run custom upgrade handler if provided, otherwise upgrade directly
		if (typeof this.onUpgrade === "function") {
			await this.onUpgrade(context, req.query.token, res)
		} else {
			res.upgrade(context)
		}
	} catch (error) {
		// log upgrade errors and reject connection
		console.error("Error upgrading connection:", error)
		res.status(401).end()
	}
}
