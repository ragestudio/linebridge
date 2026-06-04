import type LinebridgeServer from "../../server"
import type { MiddlewareHandlerFunction } from "../Handler"
import type { Route } from "../Route"

export class EngineAdaptor {
	constructor(server: LinebridgeServer) {
		this.server = server
	}

	socket_path?: string
	server: LinebridgeServer
	ws!: any

	registers: Set<Record<string, string>> = new Set()
	register!: (
		route:
			| Route<typeof this.server>
			| (new () => Route<typeof this.server>),
	) => void
	register_middleware!: (middleware: MiddlewareHandlerFunction) => void

	initialize!: () => Promise<void>

	listen!: () => Promise<void>
	close!: () => Promise<boolean>;

	[property: string]: any
}

export default EngineAdaptor
