/**
 * @fileoverview Neo engine - the uWebSockets.js engine adaptor for Linebridge.
 *
 * This engine creates a uWS app (plain or SSL), optionally attaches a WebSocket
 * server via RTEngine, and manages the HTTP request/response lifecycle.
 *
 * It is the default and only built-in engine; other engines can be added by
 * implementing the EngineAdaptor interface and registering them in `engines/index.ts`.
 */

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

/**
 * Options that control the engine's behaviour.
 */
export type EngineOptions = {
	is_ssl: boolean
	auto_close: boolean
	trust_proxy: boolean
	max_body_buffer: number
	max_body_length: number
	streaming?: any
}

/**
 * Augmented uWS TemplatedApp that supports dynamic method dispatch.
 * We wrap the typed interface so we can call `uws.get(...)`, `uws.post(...)`
 * etc. via bracket notation - needed because uWS itself uses dynamic methods
 * for route registration.
 */
type uwsEngine = uWebsockets.TemplatedApp & {
	[K in keyof uWebsockets.TemplatedApp]?: uWebsockets.TemplatedApp[K]
} & {
	[key: string]: (...args: any[]) => any
}

/**
 * The Neo engine is the uWebSockets.js adaptor.
 *
 * It handles app construction (plain or SSL), WebSocket setup, route registration,
 * middleware registration, and the request/response pipeline.
 */
export default class Engine extends EngineAdaptor {
	/** WebSocket engine instance, set when websockets are enabled. */
	declare ws: RTEngine | null
	/** The underlying uWS listen socket handle. */
	declare listen_socket: uWebsockets.us_listen_socket | null
	/** The uWS app instance (plain or SSL). */
	declare uws: uwsEngine | null

	/** Number of in-flight HTTP requests. Tracked so the server knows when it is idle. */
	protected pending_requests_count: number = 0
	/** Callback fired when the pending request count reaches zero. */
	protected pending_requests_zero_handler: any = null

	/** Base headers to include in all responses. */
	base_headers: Record<string, string> = {}

	/** Set of registered {method, path} objects to avoid duplicate registrations. */
	registers: Set<Record<string, string>> = new Set()
	/** Global middleware stack applied to every request before route handlers run. */
	middlewares: Handler<HandlerKind.middleware>[] = []

	/** Listening port, defaults to 3000. */
	port: number = 3000
	/** Listening host, defaults to "0.0.0.0". */
	host: string = "0.0.0.0"
	/** Engine-level options merged with uWS constructor options. */
	options: EngineOptions & uWebsockets.AppOptions = {
		is_ssl: false,
		auto_close: true,
		trust_proxy: false,
		max_body_buffer: 16 * 1024,
		max_body_length: 250 * 1024,
	}

	/**
	 * Initializes the engine: creates the uWS app, configures SSL if needed,
	 * attaches WebSocket support, and registers the default catch-all route.
	 */
	initialize = async () => {
		// raise uWS limits to handle apps with many headers (e.g. large cookie payloads)
		//@ts-ignore
		process.env["UWS_HTTP_MAX_HEADERS_COUNT"] = 512
		//@ts-ignore
		process.env["UWS_HTTP_MAX_HEADERS_SIZE"] = 650000

		// unless explicitly kept, hide the internal uWS Server header
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

		// validate and enable SSL when key/cert paths are provided
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

			// attach the engine adaptor to RTEngine
			this.ws.engine = this

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

	/** Starts the server. Bound to the engine instance. */
	public listen = listen.bind(this)
	/** Gracefully shuts down the server. Bound to the engine instance. */
	public close = close.bind(this)

	/** Registers a route (HTTP method + path + handler). */
	public register = route_register.bind(this)
	/** Registers a global middleware that runs before every route handler. */
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

	/** Incoming HTTP request handler. Bound to the engine instance. */
	protected on_request = on_request.bind(this)
	/** Middleware/route iteration loop. Bound to the engine instance. */
	protected request_iterator = request_iterator.bind(this)

	/**
	 * Decrements the pending request counter and fires the zero-handler
	 * when no requests remain in flight.
	 */
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

	/**
	 * Default handler for unmatched routes. Responds with a 404 JSON body.
	 */
	protected _defaultResponse(req: Request<Server>, res: Response<Server>) {
		res.status(404).json({ error: "Not found" })
	}
}
