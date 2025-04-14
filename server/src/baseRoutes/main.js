import path from "node:path"

import Route from "../classes/Route"
import Vars from "../vars"

export default class MainRoute extends Route {
	static route = "/"
	static useContexts = ["server"]

	get = async (req, res, ctx) => {
		return {
			name: ctx.server.params.refName ?? "unknown",
			version: Vars.projectPkg.version ?? "unknown",
			engine: ctx.server.params.useEngine ?? "unknown",
			lb_version: Vars.libPkg.version ?? "unknown",
			experimental: ctx.server.isExperimental ?? "unknown",
			request_time: new Date().getTime(),
		}
	}
}
