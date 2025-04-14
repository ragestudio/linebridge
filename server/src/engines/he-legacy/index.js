import he from "hyper-express"
import rtengine from "./rtengine"

export default class Engine {
	constructor(server) {
		this.server = server
	}

	static heDefaultParams = {
		max_body_length: 50 * 1024 * 1024, //50MB in bytes,
	}

	app = null
	ws = null
	router = new he.Router()
	map = new Map()

	initialize = async () => {
		this.app = new he.Server({
			...Engine.heDefaultParams,
			key_file_name: this.server.ssl?.key ?? undefined,
			cert_file_name: this.server.ssl?.cert ?? undefined,
		})

		this.router.any("*", this.defaultResponse)
		this.app.use(this.mainMiddleware)
		this.app.use(this.router)

		if (this.server.params.websockets === true) {
			this.ws = new rtengine({
				requireAuth: this.server.constructor.requiredWsAuth,
				handleAuth: this.server.handleWsAuth,
				root: `/${this.server.params.refName}`,
			})

			this.ws.initialize()

			global.websockets = this.ws

			await this.ws.io.attachApp(this.app.uws_instance)
		}
	}

	mainMiddleware = async (req, res, next) => {
		if (req.method === "OPTIONS") {
			return res.status(204).end()
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

	listen = async () => {
		await this.app.listen(this.server.params.listenPort)
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
