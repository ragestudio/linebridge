import Vars from "../vars"
import type Server from "../server"

export default (server: Server): void | null => {
	if (!server || !server.headers || !server.engine) {
		return null
	}

	let headers = {
		...server.headers,
		...Vars.baseHeaders,
	}

	const headerEntries = Object.entries(headers)

	server.engine.register_middleware(
		(req: any, res: any, next: () => void) => {
			for (let i = 0; i < headerEntries.length; i++) {
				res.setHeader(headerEntries[i][0], headerEntries[i][1])
			}

			next()
		},
	)
}
