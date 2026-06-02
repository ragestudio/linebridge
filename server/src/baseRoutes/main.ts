import Route from "../classes/Route"
import Vars from "../vars"

import type Server from "../server"
import { HttpHandlerFunction } from "../classes/Handler"
import { ContextsKeys } from "../types"

export default class MainRoute extends Route<Server> {
	path = "/"
	useContexts: ContextsKeys[] = ["server"]

	handler: HttpHandlerFunction = async (req, res, ctx) => {
		return {
			name: ctx.server.params.refName ?? "unknown",
			version: Vars.projectPkg.version,
			engine: ctx.server.params.useEngine ?? "unknown",
			lb_version: Vars.libPkg.version ?? "unknown",
			experimental: ctx.server.experimental ?? "unknown",
			request_time: new Date().getTime(),
		}
	}
}
