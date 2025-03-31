import he from "hyper-express"
import rtengineng from "../../classes/rtengineng"

export default class HyperExpressEngineNG {
	constructor(ctx) {
		this.ctx = ctx
	}

	app = null
	ws = null
	router = null

	initialize = async () => {
		console.warn(
			`hyper-express-ng is a experimental engine, some features may not be available or work properly!`,
		)

		const appParams = {
			max_body_length: 50 * 1024 * 1024, //50MB in bytes,
		}

		if (this.ctx.ssl) {
			appParams.key_file_name = this.ctx.ssl?.key ?? null
			appParams.cert_file_name = this.ctx.ssl?.cert ?? null
		}

		this.app = new he.Server(appParams)

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

		if (this.ctx.constructor.enableWebsockets === true) {
			this.ws = global.websocket = new rtengineng({
				path: this.ctx.constructor.wsPath,
				onUpgrade: this.ctx.handleWsUpgrade,
				onConnection: this.ctx.handleWsConnection,
				onDisconnect: this.ctx.handleWsDisconnect,
			})

			await this.ws.attach(this)
		}
	}

	listen = async () => {
		await this.app.listen(this.ctx.constructor.listen_port)
	}

	// close must be synchronous
	close = () => {
		if (this.ws && typeof this.ws.close === "function") {
			this.ws.close()
		}

		if (typeof this.app.close === "function") {
			this.app.close()
		}

		if (typeof this.ctx.onClose === "function") {
			this.ctx.onClose()
		}
	}
}
