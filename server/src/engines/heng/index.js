import fs from "node:fs"

import RtEngine from "../../classes/RtEngine"
import Router from "./components/router/Router"
import Server from "./components/Server"

export default class Engine {
	constructor(server) {
		this.server = server
	}

	static heDefaultParams = {
		max_body_length: 50 * 1024 * 1024, //50MB in bytes,
	}

	app = null
	ws = null
	router = new Router()
	registers = new Set()

	initialize = async () => {
		process.env["UWS_HTTP_MAX_HEADERS_COUNT"] = 512
		process.env["UWS_HTTP_MAX_HEADERS_SIZE"] = 650000

		let uWebsockets = await import("uWebSockets.js")
		uWebsockets = uWebsockets.default

		if (!process.env["KEEP_UWS_HEADER"]) {
			try {
				uWebsockets._cfg("999999990007")
			} catch (error) {
				// dont care
			}
		}

		this.app = new Server({
			...Engine.heDefaultParams,
			key_file_name: this.server.ssl?.key ?? undefined,
			cert_file_name: this.server.ssl?.cert ?? undefined,
		})

		if (ToBoolean(process.env.LB_SOCKET_MODE)) {
			this.SOCKET_PATH = `/tmp/lb_node_${this.server.params.refName}.sock`

			if (fs.existsSync(this.SOCKET_PATH)) {
				fs.unlinkSync(this.SOCKET_PATH)
			}
		}

		this.router.any("*", this.defaultResponse)
		this.app.use(this.mainMiddleware)
		this.app.use(this.router)

		if (typeof this.server.params.websockets === "object") {
			const { path, enabled } = this.server.params.websockets

			if (enabled === true) {
				this.ws = new RtEngine(this.server, {
					path: path ?? `/${this.server.params.refName}`,
					onUpgrade: this.server.handleWsUpgrade,
					onConnection: this.server.handleWsConnection,
					onDisconnect: this.server.handleWsDisconnect,
				})

				global.websockets = this.ws

				this.ws.attach(this)
			}
		}
	}

	mainMiddleware = async (req, res, next) => {
		if (this.server.params.bypassCors === true) {
			if (req.method === "OPTIONS") {
				res.setHeader("Access-Control-Allow-Origin", "*")
				res.setHeader("Access-Control-Allow-Methods", "*")
				res.setHeader("Access-Control-Allow-Headers", "*")
				res.setHeader("Access-Control-Allow-Credentials", "true")

				return res.status(204).end()
			}
		}

		// register body parser
		if (req.headers["content-type"]) {
			if (
				!req.headers["content-type"].startsWith("multipart/form-data")
			) {
				req.body = await req.urlencoded()
				req.body = await req.json(req.body)
			}
		}
	}

	defaultResponse = (req, res) => {
		return res.status(404).json({
			error: "Not found",
		})
	}

	register = (obj) => {
		// set to the endpoints map, used by _map
		this.registers.add(obj)

		// register endpoint to http interface router
		this.router[obj.method](obj.route, ...obj.middlewares, obj.fn)
	}

	listen = async () => {
		await this.app.listen(this.SOCKET_PATH ?? this.server.params.listenPort)

		if (this.SOCKET_PATH) {
			fs.chmodSync(this.SOCKET_PATH, 0o777)
		}
	}

	// close must be synchronous
	close = () => {
		if (this.ws && typeof this.ws.close === "function") {
			this.ws.close()
		}

		if (this.app && typeof this.app.close === "function") {
			this.app.close()
		}
	}
}
