import Vars from "../vars"

export default (server) => {
	if (!server || !server.headers || !server.engine || !server.engine.app) {
		return null
	}

	let headers = {
		...server.headers,
		...Vars.baseHeaders,
	}

	headers = Object.entries(headers)

	server.engine.app.use((req, res, next) => {
		for (let i = 0; i < headers.length; i++) {
			res.setHeader(headers[i][0], headers[i][1])
		}

		next()
	})
}
