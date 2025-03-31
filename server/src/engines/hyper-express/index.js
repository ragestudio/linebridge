import he from "hyper-express"
import rtengine from "../../classes/rtengine"

export default class Engine {
	constructor(ctx) {
		this.ctx = ctx
	}

	app = null
	router = null
	ws = null

	initialize = async () => {
		const serverParams = {
			max_body_length: 50 * 1024 * 1024, //50MB in bytes,
		}

		if (this.ctx.ssl) {
			serverParams.key_file_name = this.ctx.ssl?.key ?? null
			serverParams.cert_file_name = this.ctx.ssl?.cert ?? null
		}

		this.app = new he.Server(serverParams)

		this.router = new he.Router()

		// create a router map
		if (typeof this.router.map !== "object") {
			this.router.map = {}
		}

		await this.router.any("*", (req, res) => {
			return res.status(404).json({
				code: 404,
				message: "Not found",
			})
		})

		await this.app.use(async (req, res, next) => {
			if (req.method === "OPTIONS") {
				// handle cors
				if (this.ctx.constructor.ignoreCors) {
					res.setHeader("Access-Control-Allow-Methods", "*")
					res.setHeader("Access-Control-Allow-Origin", "*")
					res.setHeader("Access-Control-Allow-Headers", "*")
				}

				return res.status(204).end()
			}

			// register body parser
			if (req.headers["content-type"]) {
				if (
					!req.headers["content-type"].startsWith(
						"multipart/form-data",
					)
				) {
					req.body = await req.urlencoded()
					req.body = await req.json(req.body)
				}
			}
		})

		if (this.ctx.constructor.enableWebsockets) {
			this.ws = global.websocket = new rtengine({
				requireAuth: this.ctx.constructor.requiredWsAuth,
				handleAuth: this.ctx.handleWsAuth,
				root: `/${this.ctx.constructor.refName}`,
			})

			this.ws.initialize()

			await this.ws.io.attachApp(this.app.uws_instance)
		}
	}

	listen = async () => {
		await this.app.listen(this.ctx.constructor.listen_port)
	}

	// close should be synchronous
	close = () => {
		if (this.ws) {
			this.ws.clear()

			if (typeof this.ws?.close === "function") {
				this.ws.close()
			}
		}

		if (typeof this.app?.close === "function") {
			this.app.close()
		}

		if (typeof this.ctx.onClose === "function") {
			this.ctx.onClose()
		}
	}
}
