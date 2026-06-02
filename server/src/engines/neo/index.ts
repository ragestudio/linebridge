import uWebsockets, { RecognizedString } from "uWebSockets.js"
import fs from "node:fs"
import fs_promises from "node:fs/promises"

import RTEngine from "../../classes/RtEngine"
import WebsocketPolyfill from "./ws/Websocket.js"
import { EngineAdaptor } from "../../classes/EngineAdaptor"
import { Route } from "../../classes/Route"

import route_register from "./route_register"
import middleware_register from "./register_middleware"
import listen from "./listen"
import close from "./close"
import on_request from "./on_request"
import request_iterator from "./request_iterator"

import type { Handler, HandlerKind } from "../../classes/Handler"
import type Request from "./request"
import type Response from "./response"
import type { Server } from "../../server"

export type EngineOptions = {
	is_ssl: boolean
	auto_close: boolean
	trust_proxy: boolean
	max_body_buffer: number
	max_body_length: number
	streaming?: any
}

type uwsEngine = uWebsockets.TemplatedApp & {
	[K in keyof uWebsockets.TemplatedApp]?: uWebsockets.TemplatedApp[K]
} & {
	[key: string]: (...args: any[]) => any
}

export default class Engine extends EngineAdaptor {
	declare ws: RTEngine | null
	declare listen_socket: uWebsockets.us_listen_socket | null
	declare uws: uwsEngine | null

	protected pending_requests_count: number = 0
	protected pending_requests_zero_handler: any = null

	registers: Set<Record<string, string>> = new Set()
	middlewares: Handler<HandlerKind.middleware>[] = []

	port: number = 3000
	host: string = "0.0.0.0"
	options: EngineOptions & uWebsockets.AppOptions = {
		is_ssl: false,
		auto_close: true,
		trust_proxy: false,
		max_body_buffer: 16 * 1024,
		max_body_length: 250 * 1024,
	}

	initialize = async () => {
		//@ts-ignore
		process.env["UWS_HTTP_MAX_HEADERS_COUNT"] = 512
		//@ts-ignore
		process.env["UWS_HTTP_MAX_HEADERS_SIZE"] = 650000

		if (!process.env["KEEP_UWS_HEADER"]) {
			try {
				//@ts-ignore
				uWebsockets._cfg("999999990007")
			} catch (_e) {
				// womp womp
			}
		}

		// set port and host from server params, falling back to defaults
		this.port = this.server.params.listenPort ?? this.port
		this.host = this.server.params.listenIp ?? this.host

		if (this.server.ssl) {
			if (this.server.ssl.key && this.server.ssl.cert) {
				try {
					await Promise.all([
						fs_promises.access(this.server.ssl.key),
						fs_promises.access(this.server.ssl.cert),
					])

					this.options.is_ssl = true
					this.options.key_file_name = this.server.ssl.key
					this.options.cert_file_name = this.server.ssl.cert
				} catch (err) {
					throw new Error("Cannot access SSL key or cert: " + err)
				}
			}
		}

		// initialize the uWebsockets app depending on SSL mode
		if (this.options.is_ssl) {
			this.uws = uWebsockets.SSLApp({
				...this.options,
				key_file_name: this.server.ssl.key,
				cert_file_name: this.server.ssl.cert,
			}) as uwsEngine
		} else {
			this.uws = uWebsockets.App(this.options) as uwsEngine
		}

		// if socket mode is enabled, use a unix socket path
		if (ToBoolean(process.env.LB_SOCKET_MODE)) {
			this.socket_path = `/tmp/lb_node_${this.server.params.refName}.sock`

			// if the socket path already exists, remove it
			if (fs.existsSync(this.socket_path)) {
				fs.unlinkSync(this.socket_path)
			}
		}

		// if websockets are enabled, set up the websocket server
		if (
			typeof this.server.params.websockets === "object" &&
			this.server.params.websockets.enabled === true
		) {
			const websocket_attached_path =
				this.server.params.websockets.path ??
				`/${this.server.params.refName}`

			this.ws = new RTEngine(this.server, {
				path: websocket_attached_path,
				onUpgrade: this.server.handleWsUpgrade,
				onConnection: this.server.handleWsConnection,
				onDisconnect: this.server.handleWsDisconnect,
			})

			// attach to uWebsockets with adaptors that bridge uWS events into RTEngine
			this.uws.ws(websocket_attached_path, {
				// uWS passes (res, req, context) but RTEngine expects (req, res)
				upgrade: (res: any, req: any, _context: any) =>
					this.ws!.handleUpgrade(req, res),

				// wrap raw uWS websocket with the polyfill so RTEngine gets EventEmitter + helpers
				open: (ws: any) => {
					const poly = new WebsocketPolyfill(ws)
					ws.poly = poly
					//@ts-ignore polyfill context is Object vs RtEngineSocket's typed shape, but runtime is correct
					this.ws!.handleConnection(poly)
				},

				// forward uWS message events to the polyfill so RTEngine listeners fire
				message: (ws: any, message: ArrayBuffer, isBinary: boolean) => {
					// uWS passes raw ArrayBuffer, but RTEngine expects a string for JSON.parse
					const parsed = isBinary
						? message
						: Buffer.from(message).toString()
					ws.poly?.emit("message", parsed, isBinary)
				},

				// forward uWS close events to the polyfill so RTEngine listeners fire
				close: (ws: any, code: any, message: any) => {
					ws.poly?._destroy()
					ws.poly?.emit("close", code, message)
					delete ws.poly
				},
			})

			// @ts-ignore
			global.websockets = this.ws
		}

		// create the default route
		const defaultRoute = new Route()
		defaultRoute.method = "any"
		defaultRoute.path = "/*"
		defaultRoute.handler = this._defaultResponse

		this.register(defaultRoute)
	}

	public listen = listen.bind(this)
	public close = close.bind(this)

	public register = route_register.bind(this)
	public register_middleware = middleware_register.bind(this)

	/**
	 * Publish a message to a topic in MQTT syntax to all WebSocket connections on this Server instance.
	 * You cannot publish using wildcards, only fully specified topics.
	 */
	public publish(
		topic: RecognizedString,
		message: RecognizedString,
		is_binary?: boolean,
		compress?: boolean,
	) {
		return this.uws?.publish(topic, message, is_binary, compress)
	}

	/**
	 * Returns the number of subscribers to a topic across all WebSocket connections on this Server instance.
	 */
	public num_of_subscribers(topic: RecognizedString) {
		return this.uws?.numSubscribers(topic)
	}

	protected on_request = on_request.bind(this)
	protected request_iterator = request_iterator.bind(this)

	_resolve_pending_request() {
		if (this.pending_requests_count < 1) return

		this.pending_requests_count--

		if (
			this.pending_requests_count === 0 &&
			this.pending_requests_zero_handler
		) {
			this.pending_requests_zero_handler()
		}
	}

	protected _defaultResponse(req: Request<Server>, res: Response<Server>) {
		res.status(404).json({ error: "Not found" })
	}
}
