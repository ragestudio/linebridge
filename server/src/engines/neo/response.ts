/**
 * @fileoverview Full HTTP response wrapper for the Neo engine.
 *
 * Wraps a uWS HttpResponse and provides Express-style methods for status codes,
 * headers, cookies (with signed cookie support), streaming, file serving,
 * Server-Sent Events, redirects, and JSON/HTML shortcuts.
 */

import cookie from "cookie"
import signature from "cookie-signature"
import { STATUS_CODES } from "http"
import mime_types from "mime-types"

import SSEventStream from "./SSEventStream"

import type { HttpResponse } from "uWebSockets.js"
import type { EngineAdaptor } from "../../classes/EngineAdaptor"
import type { Route } from "../../classes/Route"
import type { Server } from "../../server"
import type { Response as BaseHttpResponse } from "../../classes/Handler/http"

const stringify = JSON.stringify

/** Pre-built status-line cache so we don't concatenate strings on every response. */
const STATUS_CACHE: Record<number, string> = Object.create(null)

for (const code in STATUS_CODES) {
	STATUS_CACHE[code as unknown as number] = `${code} ${STATUS_CODES[code]}`
}

type EventHandler = (...args: any[]) => void

/**
 * HTTP Response class wrapping a uWS HttpResponse.
 *
 * Provides methods for status codes, headers, cookies, streaming, file serving,
 * event listeners (abort, close, finish), and SSE.
 *
 * @typeParam TServer - The server type this response belongs to.
 */
export default class Response<
	TServer extends Server = Server,
> implements BaseHttpResponse {
	constructor() {}

	/** Active SSE stream, if the client requested it. */
	_sse: SSEventStream | null = null
	/** Per-response local storage for middleware communication. */
	_locals!: any
	/** The matched route. */
	route!: Route<TServer> | null
	/** Whether the response is in streaming mode. */
	_streaming!: boolean
	/** Tracks the furthest middleware index executed to prevent double-next(). */
	_middleware_cursor!: number
	/** The paired Request instance. */
	_wrapped_request!: any
	/** The uWS upgrade socket (WebSocket upgrade requests only). */
	_upgrade_socket!: any
	/** The raw uWS HttpResponse object. */
	_raw_response!: HttpResponse | null
	/** HTTP status code (defaults to 200). */
	_status_code!: number
	/** Custom status message (overrides the default from STATUS_CODES). */
	_status_message!: string | null
	/** Response headers (key → value or key → string[]). */
	_headers!: Record<string, string | string[]>
	/** Set-Cookie headers (name → serialized cookie string). */
	_cookies!: Record<string, string> | null
	/** Whether the response has been sent. */
	completed!: boolean
	/** Whether headers have been written to the wire. */
	initiated!: boolean
	/** If true, the response body is wrapped in uWS `cork()` for batching. */
	_cork!: boolean
	/** Has `cork()` already been applied? Prevents double-corking. */
	_corked!: boolean
	/** The drain handler registered for backpressure-aware streaming. */
	_drain_handler!: ((offset: number) => boolean) | null
	/** Event listeners (abort, close, finish). */
	_events!: Record<string, EventHandler[]> | null

	/**
	 * The engine that owns this response.
	 */
	get engine(): EngineAdaptor | null {
		return this.route?.engine ?? null
	}

	/**
	 * Creates a Response instance and registers the uWS `onAborted` callback.
	 *
	 * The `onAborted` handler marks the response as completed, cleans up the
	 * pending request counter, stops body parsing on the paired request, and
	 * fires abort/close event listeners.
	 */
	static create<TServer extends Server>(
		raw_response: HttpResponse,
		route: Route<TServer>,
		request: any,
		socket: any,
	): Response<TServer> {
		const res = new Response<TServer>()

		res._raw_response = raw_response
		res.route = route
		res._wrapped_request = request
		res._upgrade_socket = socket || null

		res._headers = {}

		res._status_code = 200
		res._middleware_cursor = -1

		// handle uWS abort (client disconnects before response is sent)
		raw_response.onAborted(() => {
			if (res.completed) return
			res.completed = true

			res.route?.server.engine._resolve_pending_request()
			res._wrapped_request._body_parser_stop()

			if (res._events?.abort) {
				for (let i = 0; i < res._events.abort.length; i++) {
					res._events.abort[i](res._wrapped_request, res)
				}
			}

			if (res._events?.close) {
				for (let i = 0; i < res._events.close.length; i++) {
					res._events.close[i](res._wrapped_request, res)
				}
			}
		})

		return res
	}

	/**
	 * Registers an event listener on the response.
	 * Supported events: `"abort"`, `"close"`, `"finish"`.
	 */
	on(event: string, handler: EventHandler): this {
		if (!this._events) {
			this._events = Object.create(null)
		}

		if (!this._events![event]) {
			this._events![event] = []
		}

		this._events![event].push(handler)
		return this
	}

	/**
	 * Registers an event listener that fires only once.
	 */
	once(event: string, handler: EventHandler): this {
		const wrapper = (...args: any[]) => {
			this.off(event, wrapper)
			handler(...args)
		}
		return this.on(event, wrapper)
	}

	/**
	 * Removes an event listener.
	 */
	off(event: string, handler: EventHandler): this {
		const arr = this._events?.[event]
		if (arr) {
			const idx = arr.indexOf(handler)

			if (idx !== -1) {
				arr.splice(idx, 1)
			}
		}
		return this
	}

	listenerCount(event: string): number {
		return this._events?.[event]?.length ?? 0
	}

	/**
	 * Tracks the current middleware cursor position.
	 *
	 * Throws if a middleware tries to advance backwards (i.e. double-next detection).
	 *
	 * @returns The new cursor position.
	 */
	_track_middleware_cursor(position: number) {
		if (
			this._middleware_cursor === -1 ||
			position > this._middleware_cursor
		) {
			this._middleware_cursor = position
			return position
		}

		throw new Error(
			"ERR_DOUBLE_MIDDLEWARE_EXEUCTION_DETECTED: Please ensure you are not calling the next() iterator inside of an ASYNC middleware. You must only call next() ONCE per middleware inside of SYNCHRONOUS middlewares only!",
		)
	}

	/**
	 * Wraps a handler in uWS `cork()` for batched writes.
	 * All writes inside the handler are sent in a single TCP segment.
	 */
	atomic(handler: Function): this {
		if (!this.completed) this._raw_response!.cork(handler as any)
		return this
	}

	/**
	 * Sets the HTTP status code. Optionally sets a custom status message.
	 */
	status(code: number, message?: string): this {
		this._status_code = code
		if (message !== undefined) this._status_message = message
		return this
	}

	/**
	 * Sets the `Content-Type` header from a file extension or MIME string.
	 * Prefix the value with a dot to indicate a file extension (e.g. `".html"`).
	 */
	type(mime_type: string): this {
		if (mime_type.charCodeAt(0) === 46) {
			mime_type = mime_type.slice(1)
		}

		this._headers["content-type"] =
			mime_types.contentType(mime_type) || "text/plain"

		return this
	}

	/**
	 * Sets a response header. If the header already exists and `overwrite` is false,
	 * the values are accumulated as an array.
	 */
	header(name: string, value: string | string[], overwrite?: boolean): this {
		name = name.toLowerCase()

		if (overwrite || this._headers[name] === undefined) {
			this._headers[name] = value
			return this
		}

		const existing = this._headers[name]

		if (Array.isArray(existing)) {
			if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					existing.push(value[i])
				}
			} else {
				existing.push(value)
			}
		} else {
			this._headers[name] = [existing as string, value as string]
		}

		return this
	}

	/**
	 * Sets a `Set-Cookie` header.
	 *
	 * @param name - Cookie name.
	 * @param value - Cookie value. Pass `null` to delete the cookie.
	 * @param expiry - Expiry time in milliseconds from now.
	 * @param options - Cookie options (secure, sameSite, path, etc.).
	 * @param sign_cookie - If true and `options.secret` is set, signs the cookie value.
	 */
	cookie(
		name: string,
		value: string | null,
		expiry?: number | null,
		options?: any,
		sign_cookie: boolean = true,
	): this {
		if (name && value === null)
			return this.cookie(name, "", null, { maxAge: 0 } as any)

		options = options
			? Object.assign({}, options)
			: { secure: true, sameSite: "none", path: "/" }

		if (typeof expiry === "number") {
			options.expires = options.expires || new Date(Date.now() + expiry)
			options.maxAge = options.maxAge || (expiry / 1000) | 0
		}

		if (sign_cookie && typeof options.secret === "string") {
			options.encode = false
			value = signature.sign(value as string, options.secret) as string
		}

		if (this._cookies === null) {
			this._cookies = Object.create(null)
		}

		this._cookies![name] = cookie.serialize(name, value as any, options)

		return this
	}

	/**
	 * Upgrades the HTTP connection to a WebSocket.
	 *
	 * @param context - User data to attach to the WebSocket context.
	 */
	upgrade(context?: any) {
		if (this.completed) return

		if (this._upgrade_socket == null) {
			throw new Error(
				"Cannot upgrade a request that does not come from an upgrade handler.",
			)
		}

		// if cork is requested, defer upgrade into a corked callback
		if (this._cork && !this._corked) {
			this._corked = true
			return this.atomic(() => this.upgrade(context))
		}

		const headers = this._wrapped_request.headers

		// perform the uWS upgrade with the stored socket handle
		this._raw_response!.upgrade(
			{ context },
			headers["sec-websocket-key"],
			headers["sec-websocket-protocol"],
			headers["sec-websocket-extensions"],
			this._upgrade_socket,
		)

		this.completed = true
		this.engine?._resolve_pending_request()
	}

	/**
	 * Writes the status line and all accumulated headers to the uWS response.
	 *
	 * Returns `false` if headers were already initiated (idempotent).
	 */
	_initiate_response(): boolean {
		if (this.initiated) return false
		this.initiated = true

		const raw = this._raw_response!

		if (this._status_message) {
			raw.writeStatus(`${this._status_code} ${this._status_message}`)
		} else {
			raw.writeStatus(
				STATUS_CACHE[this._status_code] || `${this._status_code} OK`,
			)
		}

		const headerKeys = Object.keys(this._headers)

		for (let i = 0; i < headerKeys.length; i++) {
			const name = headerKeys[i]
			if (name === "content-length") continue

			const values = this._headers[name]

			if (Array.isArray(values)) {
				for (let j = 0; j < values.length; j++) {
					raw.writeHeader(name, values[j])
				}
			} else {
				raw.writeHeader(name, values as unknown as string)
			}
		}

		if (this._cookies) {
			const cookieKeys = Object.keys(this._cookies)
			for (let i = 0; i < cookieKeys.length; i++) {
				raw.writeHeader("set-cookie", this._cookies[cookieKeys[i]])
			}
		}

		return true
	}

	/**
	 * Registers a drain handler for streaming responses.
	 *
	 * @param handler - Called when uWS signals the socket is writable.
	 *   Must return `true` if the chunk was successfully written.
	 */
	drain(handler: (offset: number) => boolean) {
		const is_first_time = this._drain_handler === null
		this._drain_handler = handler

		if (is_first_time) {
			this._raw_response!.onWritable((offset) => {
				const output = this._drain_handler!(offset)

				if (typeof output !== "boolean") {
					throw new Error(
						"Response.drain(handler) -> handler must return a boolean.",
					)
				}

				return output
			})
		}
	}

	/**
	 * Sends the response body and marks the response as completed.
	 *
	 * Supports corked (batched) and uncorked paths, streaming mode, and
	 * `endWithoutBody` when a custom `content-length` header is set.
	 *
	 * Fires `finish` and `close` event listeners.
	 */
	send(body?: any, close_connection?: boolean): this {
		if (this.completed) return this

		if (this._cork && !this._corked) {
			this._corked = true
			this._raw_response!.cork(() => {
				this._initiate_response()

				if (body !== undefined || this._streaming) {
					this._raw_response!.end(body, close_connection)
				} else {
					const custom_length = this._headers["content-length"]
					if (custom_length) {
						const content_length =
							typeof custom_length === "string"
								? custom_length
								: custom_length[custom_length.length - 1]
						this._raw_response!.endWithoutBody(
							content_length as any,
							close_connection,
						)
					} else {
						this._raw_response!.end(body, close_connection)
					}
				}
			})
		} else {
			this._initiate_response()

			if (!this._wrapped_request._received) {
				this._wrapped_request._body_parser_stop()
				this._wrapped_request._onDone = () => {
					this._raw_response!.cork(() => {
						this._initiate_response()
						this._raw_response!.end(body, close_connection)
					})
					this.completed = true
					this.engine?._resolve_pending_request()
				}
				return this
			}

			const raw = this._raw_response!

			if (body !== undefined || this._streaming) {
				raw.end(body, close_connection)
			} else {
				const custom_length = this._headers["content-length"]
				if (custom_length) {
					const content_length =
						typeof custom_length === "string"
							? custom_length
							: custom_length[custom_length.length - 1]
					raw.endWithoutBody(content_length as any, close_connection)
				} else {
					raw.end(body, close_connection)
				}
			}
		}

		if (!this._streaming && this.listenerCount("finish") > 0) {
			const handlers = this._events!.finish
			for (let i = 0; i < handlers.length; i++) {
				handlers[i](this._wrapped_request, this)
			}
		}

		this.completed = true
		this.engine?._resolve_pending_request()

		if (this.listenerCount("close") > 0) {
			const handlers = this._events!.close
			for (let i = 0; i < handlers.length; i++) {
				handlers[i](this._wrapped_request, this)
			}
		}

		return this
	}

	_uws_write_chunk(chunk: any, total_size?: number): [boolean, boolean] {
		if (total_size) {
			return this._raw_response!.tryEnd(chunk, total_size)
		}
		return [this._raw_response!.write(chunk), false]
	}

	/**
	 * Writes a chunk to the response body.
	 * Initiates headers if not yet sent. Returns false under backpressure.
	 */
	write(chunk: string): boolean {
		if (this._cork && !this._corked) {
			this._corked = true
			let ok = false
			this._raw_response!.cork(() => {
				this._initiate_response()
				ok = this._raw_response!.write(chunk)
			})
			return ok
		}

		this._initiate_response()
		return this._raw_response!.write(chunk)
	}

	/**
	 * Streams a single chunk with backpressure support.
	 * If the chunk doesn't fit in the uWS send buffer, it registers a drain handler.
	 */
	_stream_chunk(chunk: any, total_size?: number): Promise<void> {
		if (this.completed) return Promise.resolve()

		return new Promise((resolve) => {
			if (this._cork && !this._corked) {
				this._corked = true
				this._raw_response!.cork(() => this._initiate_response())
			} else {
				this._initiate_response()
			}

			if (this.completed) return resolve()

			const write_offset = this._raw_response!.getWriteOffset()
			const [sent] = this._uws_write_chunk(chunk, total_size)

			if (sent) return resolve()

			this.drain((offset) => {
				if (this.completed || !total_size) {
					resolve()
					return true
				}

				const remaining = chunk.slice(offset - write_offset)
				const [flushed] = this._uws_write_chunk(remaining, total_size)

				if (flushed) resolve()
				return flushed
			})
		})
	}

	/**
	 * Streams a Readable to the client chunk by chunk.
	 *
	 * @param readable - A Node.js Readable stream.
	 * @param total_size - Total size hint for uWS `tryEnd`.
	 */
	async stream(readable: any, total_size?: number) {
		if (this.completed) return

		const destroyReadable = () => !readable.destroyed && readable.destroy()
		this.once("close", destroyReadable)

		while (
			!this.completed &&
			!readable.readableEnded &&
			!readable.destroyed
		) {
			let chunk = readable.read()
			if (!chunk) {
				await new Promise<void>((resolve) => {
					readable.once("end", resolve)
					readable.once("readable", () => {
						readable.removeListener("end", resolve)
						resolve()
					})
				})
				chunk = readable.read()
			}

			if (chunk) await this._stream_chunk(chunk, total_size)
		}

		if (!this.completed) {
			if (total_size) this.engine?._resolve_pending_request()
			else this.send()
		}
	}

	/**
	 * Immediately closes the response (hard abort).
	 */
	close() {
		if (this.completed) return

		this.completed = true
		this.engine?._resolve_pending_request()
		this._wrapped_request._body_parser_stop()
		this._raw_response!.close()
	}

	/**
	 * Sends a 302 redirect response.
	 */
	redirect(url: string): boolean {
		if (this.completed) return false
		return this.status(302).header("location", url).send() as any
	}

	/**
	 * Fast-path send used by the `_invokeHandler` in on_request.ts.
	 * Skips cork/uncork logic and writes directly.
	 */
	_sendFast(body: any): void {
		this._corked = true
		this._initiate_response()
		this._raw_response!.end(body)

		this.completed = true
		this.engine?._resolve_pending_request()

		if (this._events?.finish) {
			for (let i = 0; i < this._events.finish.length; i++) {
				this._events.finish[i](this._wrapped_request, this)
			}
		}

		if (this._events?.close) {
			for (let i = 0; i < this._events.close.length; i++) {
				this._events.close[i](this._wrapped_request, this)
			}
		}
	}

	/**
	 * Sends a JSON response. Sets `Content-Type: application/json` and
	 * serializes the body with `JSON.stringify`.
	 */
	json(body: any): this {
		this._headers["content-type"] = "application/json"
		return this.send(stringify(body))
	}

	/**
	 * Sends an HTML response. Sets `Content-Type: text/html`.
	 */
	html(body: any): this {
		this._headers["content-type"] = "text/html"
		return this.send(body)
	}

	/**
	 * Per-response local storage for middleware communication.
	 */
	get locals(): Record<string, any> {
		if (!this._locals) this._locals = Object.create(null)
		return this._locals
	}

	/**
	 * The raw uWS HttpResponse.
	 */
	get raw(): HttpResponse | null {
		return this._raw_response
	}

	/**
	 * Whether the response has been aborted by the client.
	 */
	get aborted(): boolean {
		return this.completed
	}

	/**
	 * The uWS upgrade socket handle (WebSocket upgrade requests only).
	 */
	get upgrade_socket(): any {
		return this._upgrade_socket
	}

	/**
	 * Accessor for Server-Sent Events.
	 *
	 * Only available on GET requests. Creates a lazy SSEventStream on first access.
	 */
	get sse(): SSEventStream | undefined {
		if (this._wrapped_request.method === "GET") {
			if (this._sse === null) {
				this._sse = new SSEventStream()
				this._sse._response = this
			}
			return this._sse
		}
	}

	/**
	 * The current uWS write offset. Returns `-1` if the response is completed.
	 */
	get write_offset(): number {
		return this.completed ? -1 : this._raw_response!.getWriteOffset()
	}

	/**
	 * The HTTP status code.
	 */
	get statusCode() {
		return this._status_code
	}
	set statusCode(value) {
		this._status_code = value
	}

	/**
	 * The HTTP status message.
	 */
	get statusMessage() {
		return this._status_message
	}
	set statusMessage(value) {
		this._status_message = value
	}

	/**
	 * Whether response headers have been sent.
	 */
	get headersSent() {
		return this.initiated
	}

	/**
	 * Appends values to a header (alias for `header()`).
	 */
	append(name: string, values: any) {
		return this.header(name, values)
	}

	/**
	 * Sets a header value (alias for `header()` with overwrite behaviour).
	 */
	setHeader(name: string, values: any) {
		return this.header(name, values)
	}

	/**
	 * Writes multiple headers at once from an object.
	 */
	writeHeaders(headers: any) {
		for (const key in headers) this.header(key, headers[key])
	}

	/**
	 * Alias for `writeHeaders()`.
	 */
	setHeaders(headers: any) {
		this.writeHeaders(headers)
	}

	/**
	 * Writes multiple values for a single header.
	 */
	writeHeaderValues(name: string, values: any) {
		for (let i = 0; i < values.length; i++) this.header(name, values[i])
	}

	/**
	 * Returns the value(s) of a header.
	 */
	getHeader(name: string) {
		return this._headers[name]
	}

	/**
	 * Removes a header.
	 */
	removeHeader(name: string) {
		delete this._headers[name]
	}

	/**
	 * Sets a cookie (shorthand for `cookie()`).
	 */
	setCookie(name: string, value: any, options: any) {
		return this.cookie(name, value, null, options)
	}

	/**
	 * Checks if a cookie has been queued.
	 */
	hasCookie(name: string) {
		return this._cookies !== null && this._cookies[name] !== undefined
	}

	/**
	 * Removes a cookie by setting it to null.
	 */
	removeCookie(name: string) {
		return this.cookie(name, null)
	}

	/**
	 * Alias for `removeCookie()`.
	 */
	clearCookie(name: string) {
		return this.cookie(name, null)
	}

	/**
	 * Alias for `send()`.
	 */
	end(data?: any) {
		return this.send(data)
	}

	/**
	 * Content negotiation by Accept header. Not implemented in this engine.
	 */
	format() {
		this._throw_unsupported("format()")
	}

	/**
	 * Returns the header value(s) for a given name.
	 */
	get(name: string) {
		const values = this._headers[name]

		if (values) {
			return typeof values === "string" ? values : values[0]
		}
	}

	/**
	 * Sets the `Link` header from an object mapping rel → URL.
	 */
	links(links: any) {
		const chunks: string[] = []
		for (const rel in links) {
			chunks.push(`<${links[rel]}>; rel="${rel}"`)
		}
		this.header("link", chunks.join(", "))
	}

	/**
	 * Sets the `Location` header, used for redirects.
	 */
	location(path: string) {
		this._headers["location"] = path as any
		return this
	}

	/**
	 * Template rendering. Not implemented in this engine.
	 */
	render() {
		this._throw_unsupported("render()")
	}

	sendStatus(status_code: number) {
		this._status_code = status_code
		return this.send()
	}

	/**
	 * Sets headers using either `(key, value)` or `({ key: value })`.
	 */
	set(field: any, value: any) {
		if (typeof field === "object") {
			for (const key in field) this.header(key, field[key])
		} else {
			this.header(field, value)
		}
	}

	/**
	 * Sets the `Vary` header.
	 */
	vary(name: string) {
		this._headers["vary"] = name as any
		return this
	}

	/**
	 * Throws an error indicating a method is not supported by this engine.
	 */
	_throw_unsupported(name: string) {
		throw new Error(
			`ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Response.${name} which is unsupported.`,
		)
	}
}
