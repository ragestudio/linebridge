import Vars from "../vars"
import type Server from "../server"

export default (server: Server): void | null => {
	if (!server || !server.engine) {
		return null
	}

	const baseHeaders = {
		...server.headers,
		...Vars.baseHeaders,
	}

	server.engine.baseHeaders = Object.entries(baseHeaders)
}
