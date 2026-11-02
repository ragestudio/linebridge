import uws_wrapper, { type uWebsockets } from "../uws"

import Websocket, { type WebsocketRaw } from "./Websocket"
import { wrap_object, array_buffer_to_string } from "../utils"

export type WebsocketMessageType = "String" | "Buffer" | "ArrayBuffer"

export interface WebsocketRouteOptions {
	idle_timeout: number
	message_type: WebsocketMessageType
	compression: uWebsockets.CompressOptions
	max_backpressure: number
	max_payload_length: number
}

interface WebsocketRouteApp {
	routes: Record<string, Record<string, any>>
	uws_instance: uWebsockets.TemplatedApp
	_create_route(options: {
		method: string
		pattern: string
		handler: (request: any, response: any) => void
		options?: Record<string, any>
	}): void
	_handle_uws_request(
		route: any,
		request: uWebsockets.HttpRequest,
		response: uWebsockets.HttpResponse,
		socket_context: uWebsockets.us_socket_context_t,
	): void
}

export interface WebsocketRouteConstructorOptions {
	app: WebsocketRouteApp
	pattern: string
	handler: (websocket: Websocket) => void
	options?: Partial<WebsocketRouteOptions>
}

type MessageParser = (message: ArrayBuffer) => string | Buffer | ArrayBuffer

export default class WebsocketRoute {
	#upgrade_with: any
	#message_parser: MessageParser

	app: WebsocketRouteApp
	pattern: string
	handler: (websocket: Websocket) => void

	options: WebsocketRouteOptions = {
		idle_timeout: 32,
		message_type: "String",
		compression: uws_wrapper.DISABLED,
		max_backpressure: 1024 * 1024,
		max_payload_length: 32 * 1024,
	}

	constructor({
		app,
		pattern,
		handler,
		options,
	}: WebsocketRouteConstructorOptions) {
		this.app = app
		this.pattern = pattern
		this.handler = handler

		// merge user options over the local defaults
		wrap_object(this.options, options ?? {})
		this.#message_parser = this._get_message_parser(
			this.options.message_type,
		)

		this._load_companion_route()
		this._create_uws_route()
	}

	/**
	 * Returns a parser that converts a uws ArrayBuffer to the configured type.
	 */
	_get_message_parser(type: WebsocketMessageType): MessageParser {
		switch (type) {
			case "String":
				return (array_buffer) => array_buffer_to_string(array_buffer)
			case "Buffer":
				// copy the buffer because uws deallocates it after this sync call
				return (array_buffer) =>
					Buffer.concat([Buffer.from(array_buffer)])
			case "ArrayBuffer":
				return (array_buffer) => array_buffer
			default:
				throw new Error(
					"Server.ws(options) -> options.message_type must be one of ['String', 'Buffer', 'ArrayBuffer']",
				)
		}
	}

	/**
	 * Loads the companion upgrade route from the app routes.
	 * @private
	 */
	_load_companion_route(): void {
		const companion = this.app.routes["upgrade"][this.pattern]

		if (companion) {
			this.#upgrade_with = companion
			return
		}

		// create a temporary default route that upgrades every request
		this.app._create_route({
			method: "upgrade",
			pattern: this.pattern,
			handler: (_request, response) => response.upgrade(),
			options: {
				_temporary: true,
			},
		})

		this.#upgrade_with = this.app.routes["upgrade"][this.pattern]
	}

	/**
	 * Sets the upgrade route used for incoming upgrade requests.
	 * @private
	 */
	_set_upgrade_route(route: any): void {
		this.#upgrade_with = route
	}

	/**
	 * Creates the uws ws route that powers this instance.
	 * @private
	 */
	_create_uws_route(): void {
		const {
			compression,
			idle_timeout,
			max_backpressure,
			max_payload_length,
		} = this.options

		const uws_options: uWebsockets.WebSocketBehavior<any> = {
			compression,
			idleTimeout: idle_timeout,
			maxBackpressure: max_backpressure,
			maxPayloadLength: max_payload_length,
		}

		// pipe upgrade requests through the app request lifecycle
		uws_options.upgrade = (uws_response, uws_request, socket_context) =>
			this.app._handle_uws_request(
				this.#upgrade_with,
				uws_request,
				uws_response,
				socket_context,
			)

		uws_options.open = (ws) => this._on_open(ws as WebsocketRaw)
		uws_options.drain = (ws) => this._on_drain(ws as WebsocketRaw)
		uws_options.ping = (ws, message) =>
			this._on_ping(ws as WebsocketRaw, message)
		uws_options.pong = (ws, message) =>
			this._on_pong(ws as WebsocketRaw, message)
		uws_options.close = (ws, code, message) =>
			this._on_close(ws as WebsocketRaw, code, message)
		uws_options.message = (ws, message, is_binary) =>
			this._on_message(ws as WebsocketRaw, message, is_binary)

		this.app.uws_instance.ws(this.pattern, uws_options)
	}

	/**
	 * Handles the uws open event.
	 * @private
	 */
	_on_open(ws: WebsocketRaw): void {
		ws.poly = new Websocket(ws)
		this.handler(ws.poly)
	}

	/**
	 * Handles the uws ping event.
	 * @private
	 */
	_on_ping(
		ws: WebsocketRaw,
		message: ArrayBuffer = new ArrayBuffer(0),
	): void {
		ws.poly!.emit("ping", this.#message_parser(message))
	}

	/**
	 * Handles the uws pong event.
	 * @private
	 */
	_on_pong(
		ws: WebsocketRaw,
		message: ArrayBuffer = new ArrayBuffer(0),
	): void {
		ws.poly!.emit("pong", this.#message_parser(message))
	}

	/**
	 * Handles the uws drain event.
	 * @private
	 */
	_on_drain(ws: WebsocketRaw): void {
		ws.poly!.emit("drain")
	}

	/**
	 * Handles the uws message event.
	 * @private
	 */
	_on_message(
		ws: WebsocketRaw,
		message: ArrayBuffer = new ArrayBuffer(0),
		is_binary: boolean,
	): void {
		ws.poly!.emit("message", this.#message_parser(message), is_binary)
	}

	/**
	 * Handles the uws close event.
	 * @private
	 */
	_on_close(
		ws: WebsocketRaw,
		code: number,
		message: ArrayBuffer = new ArrayBuffer(0),
	): void {
		ws.poly!._destroy()
		ws.poly!.emit("close", code, this.#message_parser(message))

		// release the polyfill so it can be garbage collected
		delete ws.poly
	}
}
