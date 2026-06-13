/**
 * @fileoverview Full HTTP request wrapper for the Neo engine.
 *
 * Wraps a raw uWS HttpRequest and provides high-level accessors for headers,
 * body parsing (JSON, text, urlencoded, buffer), cookies, IP resolution,
 * and path/query parameters.
 *
 * All body parsing is lazy and cached - calling `.json()` a second time returns a
 * cached promise.
 */

import util from "util"
import cookie from "cookie"
import busboy from "busboy"
import querystring from "fast-querystring"
import signature from "cookie-signature"

import { array_buffer_to_string } from "./utils"
import MultipartField from "./MultipartField"

import type { HttpRequest, HttpResponse } from "uWebSockets.js"
import type { Request as BaseHttpRequest } from "../../classes/Handler/http"
import type { EngineAdaptor } from "../../classes/EngineAdaptor"
import type { Route } from "../../classes/Route"
import type { Server } from "../../server"
import type Response from "./response"

const utf8Decoder = new util.TextDecoder("utf-8")

/**
 * HTTP Request class wrapping a uWS HttpRequest.
 *
 * Provides parsed access to the request path, query string, headers, cookies,
 * and body. Body parsing is lazy and supports JSON, text, urlencoded, and buffer.
 *
 * @typeParam TServer - The server type this request belongs to.
 */
export default class Request<
	TServer extends Server = Server,
> implements BaseHttpRequest {
	/** Per-request local storage for middleware communication. */
	_locals!: any
	/** Whether the response stream is paused. */
	_paused!: boolean
	/** Whether the request has finished sending its body. */
	_request_ended!: boolean
	/** HTTP method string, normalized (e.g. "GET", "DELETE"). */
	_method!: string
	/** Full URL including query string. */
	_url!: string
	/** URL path portion without query string. */
	_path!: string
	/** Raw query string (without leading `?`). */
	_query_str!: string
	/** Resolved remote IP address. */
	_remote_ip!: string
	/** Resolved proxy IP address. */
	_remote_proxy_ip!: string
	/** Parsed cookies (lazy). */
	_cookies!: any
	/** URL path parameters extracted by uWS (e.g. `/user/:id`). */
	_path_parameters!: any
	/** Parsed query string parameters (lazy). */
	_query_parameters!: any
	/** The raw uWS HttpRequest object. */
	_raw_request!: HttpRequest
	/** The raw uWS HttpResponse object (needed for `onData` and `getRemoteAddress`). */
	_raw_response!: HttpResponse
	/** Context object for sharing data between middlewares and the handler. */
	ctx!: Record<string, any>
	/** Cached request headers (lazy). */
	_headers!: Record<string, string> | null
	/** The matched route for this request. */
	route!: Route<TServer> | null
	/** Whether all body chunks have been received. */
	_received!: boolean
	/** Total bytes received so far for the body. */
	_body_received_bytes!: number
	/** Expected body byte length from `content-length` header. */
	_body_expected_bytes!: number
	/** Whether the body is being sent via chunked transfer encoding. */
	_body_chunked_transfer!: boolean
	/** Buffered body chunks while waiting for parsing to complete. */
	_body_parser_buffered!: Buffer[] | null
	/** Has the onData listener been registered for body parsing? */
	_body_parser_on_data_registered!: boolean
	/** Parsed body (populated lazily by `.json()`, `.text()`, etc.). */
	_body!: any
	/** The type that `.parseBody()` resolved to. */
	_body_type!: string | null
	/** Raw body buffer, populated after body is fully received. */
	_body_raw!: Buffer | null
	/** Promise that resolves once all body data is received. */
	_received_data_promise!: Promise<Buffer> | null
	/** Cached promise for `.buffer()`. */
	_buffer_promise!: Promise<Buffer> | null
	/** Cached promise for `.text()`. */
	_text_promise!: Promise<string> | null
	/** Cached promise for `.json()`. */
	_json_promise!: Promise<any> | null
	/** Cached promise for `.urlencoded()`. */
	_urlencoded_promise!: Promise<any> | null
	/** Promise tracking the current multipart field being processed. */
	_multipart_promise!: Promise<void> | null
	/** Callback invoked when body data is fully received (used by the body promise). */
	_onDone!: (() => void) | null

	constructor() {}

	/**
	 * Creates a Request instance from raw uWS objects.
	 *
	 * Extracts the method, path, query string, and path parameters in a single
	 * synchronous step so they are ready before any middleware runs.
	 */
	static create<TServer extends Server>(
		route: Route<TServer>,
		raw_request: HttpRequest,
		raw_response: HttpResponse,
	): Request<TServer> {
		const req = new Request<TServer>()

		req._raw_request = raw_request
		req._raw_response = raw_response
		req.route = route
		req.ctx = route.ctx || Object.create(null)
		req._query_str = raw_request.getQuery()
		req._path = raw_request.getUrl()
		req._received = true

		// normalize method - uWS uses "del" internally, we want "DELETE"
		const rawMethod = raw_request.getMethod()
		req._method = rawMethod === "del" ? "DELETE" : rawMethod.toUpperCase()

		// extract path parameters (e.g. `/user/:id` → `{ id: "42" }`)
		const keys = route.pathParametersKey

		if (keys.length > 0) {
			const params = Object.create(null)

			for (let i = 0; i < keys.length; i++) {
				params[keys[i][0]] = raw_request.getParameter(keys[i][1])
			}

			req._path_parameters = params
		}

		return req
	}

	/**
	 * The engine that owns this request.
	 */
	get engine(): EngineAdaptor | null {
		return this.route?.engine || null
	}

	/**
	 * The raw uWS HttpRequest.
	 */
	get raw(): HttpRequest {
		return this._raw_request
	}

	/**
	 * Lazily-parsed headers as a plain object.
	 * Header names are lowercased by uWS.
	 */
	get headers(): Record<string, string> {
		if (this._headers) return this._headers
		this._headers = {}
		this._raw_request.forEach((key: string, value: string) => {
			this._headers![key] = value
		})
		return this._headers
	}

	/**
	 * Pauses the underlying response stream.
	 * Used during body parsing to apply backpressure.
	 */
	pause(): this {
		if (!this._paused) {
			this._paused = true
			this._raw_response.pause()
		}
		return this
	}

	/**
	 * Resumes the underlying response stream.
	 */
	resume(): this {
		if (this._paused) {
			this._paused = false
			this._raw_response.resume()
		}
		return this
	}

	// TODO: properly implement pipe
	// pipe(target: Writable): this {
	// 	// write any chunks the body parser already buffered
	// 	if (this._body_parser_buffered) {
	// 		for (let i = 0; i < this._body_parser_buffered.length; i++) {
	// 			target.write(this._body_parser_buffered[i])
	// 		}

	// 		this._body_parser_buffered = null
	// 	}

	// 	// resolve any pending body promise before overriding onData
	// 	if (this._onDone) {
	// 		this._onDone()
	// 		this._onDone = null
	// 	}

	// 	// body parser is no longer active - pipe takes over
	// 	this._body_parser_on_data_registered = false

	// 	// if the complete body was already buffered, just end the target
	// 	if (this._received) {
	// 		target.end()
	// 		return this
	// 	}

	// 	// body is still arriving - register onData for the remaining chunks
	// 	this._raw_response.onData((chunk: ArrayBuffer, is_last: boolean) => {
	// 		if (!chunk.byteLength && !is_last) {
	// 			return
	// 		}

	// 		// uWS reuses the underlying ArrayBuffer, so we must copy
	// 		// the data explicitly before writing to the target stream
	// 		const chunkCopy = Buffer.allocUnsafe(chunk.byteLength)
	// 		Buffer.from(chunk).copy(chunkCopy)

	// 		const canContinue = target.write(chunkCopy)

	// 		if (is_last) {
	// 			target.end()
	// 		} else if (!canContinue) {
	// 			this.pause()
	// 			target.once("drain", () => this.resume())
	// 		}
	// 	})

	// 	this.resume()
	// 	return this
	// }

	/**
	 * Signs a string with a secret using the same algorithm as `cookie-signature`.
	 */
	sign(string: string, secret: string) {
		return signature.sign(string, secret)
	}

	/**
	 * Unsigns a signed value. Returns the original string or `undefined` on failure.
	 */
	unsign(signed_value: string, secret: string) {
		const unsigned_value = signature.unsign(signed_value, secret)
		return unsigned_value !== false ? unsigned_value : undefined
	}

	/**
	 * Starts the body parser by registering a uWS `onData` callback.
	 *
	 * This is called before any body-consuming method (`.json()`, `.text()`, etc.)
	 * to begin buffering incoming body chunks.
	 */
	_body_parser_run(response: Response<TServer>, limit_bytes: number) {
		const content_length = Number(this.headers["content-length"])
		const is_chunked_transfer =
			this.headers["transfer-encoding"] === "chunked"

		this._body_expected_bytes = is_chunked_transfer ? 0 : content_length
		this._body_chunked_transfer = is_chunked_transfer

		if (!this._body_parser_on_data_registered) {
			this._received = false
			this._body_received_bytes = 0
			this._body_parser_buffered = []
			this._body_parser_on_data_registered = true

			// register the uWS body listener - fires for every chunk
			this._raw_response.onData((chunk: ArrayBuffer, is_last: boolean) =>
				this._body_parser_on_chunk(response, chunk, is_last),
			)
		}

		return true
	}

	/**
	 * Stops the body parser and discards buffered chunks.
	 * Called when the response is sent before the body is fully consumed.
	 */
	_body_parser_stop() {
		this._body_parser_flush_buffered()
	}

	/**
	 * Handles an incoming body chunk from uWS.
	 *
	 * Buffers the chunk, tracks received bytes, and fires the `_onDone`
	 * callback when the last chunk arrives.
	 */
	_body_parser_on_chunk(
		response: Response<TServer>,
		chunk: ArrayBuffer,
		is_last: boolean,
	) {
		// response already sent - ignore remaining body chunks
		if (response.completed) return

		if (!chunk.byteLength && !is_last) return

		this._body_received_bytes += chunk.byteLength

		if (this._body_parser_buffered) {
			// uWS reuses ArrayBuffers, so we must copy each chunk
			const chunkCopy = Buffer.allocUnsafe(chunk.byteLength)
			Buffer.from(chunk).copy(chunkCopy)
			this._body_parser_buffered.push(chunkCopy)

			if (
				this._body_received_bytes >
				(this.engine?.options.max_body_buffer ?? Infinity)
			) {
				// Prevent hanging when buffering large requests in memory directly
				// by avoiding pause() if we are actively reading the entire body.
				if (
					!this._received_data_promise &&
					!this._buffer_promise &&
					!this._text_promise &&
					!this._json_promise &&
					!this._urlencoded_promise
				) {
					this.pause()
				}
			}
		}

		// last chunk received - mark body as complete and fire the done callback
		if (is_last) {
			this._received = true

			if (this._onDone) {
				this._onDone()
				this._onDone = null
			}
		}
	}

	/**
	 * Discards buffered body chunks and resumes the stream.
	 */
	_body_parser_flush_buffered() {
		if (this._body_parser_buffered) {
			this._body_parser_buffered = null
		}
		this.resume()
	}

	/**
	 * Returns a promise that resolves with the complete raw body buffer.
	 *
	 * If the body data hasn't arrived yet, it waits via the `_onDone` callback.
	 * The result is cached in `_body_raw`.
	 */
	_body_parser_get_received_data(): Promise<Buffer> {
		if (this._received_data_promise) return this._received_data_promise

		// empty body (no content-length and not chunked)
		if (!this._body_chunked_transfer && this._body_expected_bytes <= 0) {
			return Promise.resolve(Buffer.allocUnsafe(0))
		}

		// data already fully received
		if (this._received && this._body_parser_buffered) {
			const result = Buffer.concat(this._body_parser_buffered)
			this._body_raw = result
			this._body_parser_buffered = null
			return Promise.resolve(result)
		}

		// data already received but buffer was flushed (e.g. after handler sent response)
		if (this._received && !this._body_parser_buffered) {
			return Promise.resolve(this._body_raw || Buffer.allocUnsafe(0))
		}

		// body has not arrived yet - create a promise that resolves when it does
		this._received_data_promise = new Promise<Buffer>((resolve, reject) => {
			if (this._received && this._body_parser_buffered) {
				const result = Buffer.concat(this._body_parser_buffered)
				this._body_raw = result
				this._body_parser_buffered = null
				resolve(result)
				return
			}

			// timeout after 3 seconds if the body never fully arrives
			const timeout = setTimeout(() => {
				console.log("[DEBUG] Promise timed out!")
				reject(new Error("Timeout waiting for body"))
			}, 3000)

			// store the resolver for when body data arrives
			this._onDone = () => {
				clearTimeout(timeout)

				if (this._body_parser_buffered) {
					const result = Buffer.concat(this._body_parser_buffered)

					this._body_raw = result
					this._body_parser_buffered = null
					resolve(result)
				} else {
					resolve(Buffer.allocUnsafe(0))
				}
				this._onDone = null
			}
		})

		return this._received_data_promise
	}

	/**
	 * Resolves the raw body buffer. Cached once resolved.
	 */
	async _resolve_raw_body(): Promise<Buffer> {
		if (this._body_raw) return this._body_raw
		this._body_raw = await this._body_parser_get_received_data()
		return this._body_raw
	}

	/**
	 * Returns the entire request body as a Buffer.
	 * Cached - calling it multiple times returns the same promise.
	 */
	buffer(): any {
		if (this._buffer_promise) {
			return this._buffer_promise
		}

		this._buffer_promise = this._resolve_raw_body().then((raw) => {
			this._body = raw
			this._body_type = "buffer"
			return raw
		})

		return this._buffer_promise
	}

	/**
	 * Decodes a Uint8Array to string. Uses the fast UTF-8 decoder when possible.
	 */
	_uint8_to_string(uint8: Uint8Array, encoding: string = "utf-8") {
		if (encoding === "utf-8" || encoding === "utf8") {
			return utf8Decoder.decode(uint8)
		}

		return new util.TextDecoder(encoding).decode(uint8)
	}

	/**
	 * Returns the entire request body as a string.
	 * Cached - calling it multiple times returns the same promise.
	 */
	text() {
		if (this._text_promise) return this._text_promise

		this._text_promise = this._resolve_raw_body().then((raw) => {
			const text = this._uint8_to_string(raw)
			this._body = text
			this._body_type = "text"
			return text
		})

		return this._text_promise
	}

	/**
	 * Parses the request body as JSON.
	 * Cached - calling it multiple times returns the same promise.
	 *
	 * @param default_value - Value to return if JSON parsing fails (default: `{}`).
	 */
	json(default_value = {}) {
		if (this._json_promise) return this._json_promise

		this._json_promise = this._resolve_raw_body().then((raw) => {
			const text = this._uint8_to_string(raw)

			try {
				this._body = JSON.parse(text)
			} catch (error) {
				if (default_value !== undefined && default_value !== null) {
					this._body = default_value
				} else {
					throw error
				}
			}
			this._body_type = "json"
			return this._body
		})

		return this._json_promise
	}

	/**
	 * Parses the request body as URL-encoded form data.
	 * Cached - calling it multiple times returns the same promise.
	 */
	urlencoded() {
		if (this._urlencoded_promise) return this._urlencoded_promise

		this._urlencoded_promise = this._resolve_raw_body().then((raw) => {
			const text = this._uint8_to_string(raw)

			this._body = querystring.parse(text)
			this._body_type = "urlencoded"

			return this._body
		})

		return this._urlencoded_promise
	}

	/**
	 * Handles a single multipart field by calling the user's handler function.
	 *
	 * Ensures only one field is processed at a time to avoid race conditions.
	 */
	async _on_multipart_field(
		handler: Function,
		name: string,
		value: any,
		info: any,
	) {
		const field = new MultipartField(name, value, info)

		// wait for the previous field to finish processing
		if (this._multipart_promise) {
			this.pause()
			await this._multipart_promise
			this.resume()
		}

		const output = handler(field)
		if (output instanceof Promise) {
			this._multipart_promise = output
			await this._multipart_promise
			this._multipart_promise = null
		}

		// resume the file stream so busboy can continue
		if (field.file && !field.file.stream.readableEnded)
			field.file.stream.resume()
	}

	// TODO: properly implement multipart
	// multipart(options: any, handler: any) {
	// 	if (typeof options === "function") {
	// 		handler = options
	// 		options = {}
	// 	}

	// 	options = Object.assign({}, options)
	// 	if (!options.headers) options.headers = this.headers

	// 	if (typeof handler !== "function") {
	// 		throw new Error(
	// 			"Request.multipart(handler) -> handler must be a Function.",
	// 		)
	// 	}

	// 	const content_type = this.headers["content-type"]
	// 	if (!content_type || !/^(multipart\/.+);(.*)$/i.test(content_type)) {
	// 		return Promise.resolve()
	// 	}

	// 	return new Promise((resolve, reject) => {
	// 		const uploader = busboy(options)
	// 		let finished = false

	// 		const finish = async (error?: string | Error | null) => {
	// 			if (finished) return
	// 			finished = true

	// 			let silent_error = false
	// 			if (
	// 				error instanceof Error &&
	// 				error.message === "Unexpected end of form"
	// 			)
	// 				silent_error = true

	// 			if (error && !silent_error) {
	// 				reject(error)
	// 			} else {
	// 				if (this._multipart_promise) await this._multipart_promise
	// 				resolve(null)
	// 			}

	// 			this._body_parser_stop()
	// 			uploader.destroy()
	// 		}

	// 		uploader.once("error", finish)
	// 		uploader.once("partsLimit", () => finish("PARTS_LIMIT_REACHED"))
	// 		uploader.once("filesLimit", () => finish("FILES_LIMIT_REACHED"))
	// 		uploader.once("fieldsLimit", () => finish("FIELDS_LIMIT_REACHED"))

	// 		const on_field = (name: any, value: any, info: any) => {
	// 			if (
	// 				value &&
	// 				typeof value === "object" &&
	// 				typeof value.once === "function"
	// 			) {
	// 				value.once("error", finish)
	// 			}

	// 			this._on_multipart_field(handler, name, value, info).catch(
	// 				finish,
	// 			)
	// 		}

	// 		uploader.on("field", on_field)
	// 		uploader.on("file", on_field)

	// 		uploader.once("close", () => {
	// 			if (this._multipart_promise) {
	// 				this._multipart_promise.then(() => finish()).catch(finish)
	// 			} else {
	// 				finish()
	// 			}
	// 		})

	// 		this.pipe(uploader)
	// 	})
	// }

	/**
	 * Per-request local storage for middleware communication.
	 */
	get locals() {
		if (!this._locals) this._locals = Object.create(null)
		return this._locals
	}

	/** Whether the request stream is paused. */
	get paused() {
		return this._paused
	}

	/** Normalized HTTP method (uppercase). */
	get method() {
		return this._method
	}

	/** Full URL (path + query string). */
	get url() {
		if (this._url) return this._url
		this._url = this._path + (this._query_str ? "?" + this._query_str : "")
		return this._url
	}

	/** URL path (no query string). */
	get path() {
		return this._path
	}

	/** Parsed query string parameters. */
	get query() {
		return this.query_parameters || {}
	}

	/** Alias for `path_parameters`. */
	get params() {
		return this._path_parameters || {}
	}

	/**
	 * Parsed cookies from the `Cookie` header.
	 * Parsed lazily on first access.
	 */
	get cookies() {
		if (this._cookies) return this._cookies
		const header = this.headers["cookie"]
		this._cookies = header ? cookie.parse(header) : Object.create(null)
		return this._cookies
	}

	/** URL path parameters extracted by uWS (e.g. `/user/:id` → `{ id: "42" }`). */
	get path_parameters() {
		return this._path_parameters || {}
	}

	/** Parsed query string as an object (lazy). */
	get query_parameters() {
		if (this._query_parameters) return this._query_parameters
		this._query_parameters = querystring.parse(this._query_str)
		return this._query_parameters
	}

	/** The parsed body. Populated after calling `.parseBody()`, `.json()`, `.text()`, etc. */
	get body() {
		return this._body
	}

	/**
	 * Automatically parses the request body based on `Content-Type`.
	 *
	 * - `application/json` → `.json()`
	 * - `application/x-www-form-urlencoded` → `.urlencoded()`
	 * - `text/*`, `application/xml`, `application/javascript`, or no content-type → `.text()`
	 * - `multipart/form-data` → `undefined` (multipart is not yet fully implemented)
	 */
	async parseBody(): Promise<any> {
		if (this._body !== undefined && this._body !== null) return this._body

		const contentType = (this.headers["content-type"] || "").toLowerCase()

		if (contentType.includes("application/json")) {
			return this.json()
		}

		if (contentType.includes("application/x-www-form-urlencoded")) {
			return this.urlencoded()
		}

		if (
			contentType.includes("text/") ||
			contentType.includes("application/xml") ||
			contentType.includes("application/javascript") ||
			!contentType
		) {
			return this.text()
		}

		if (contentType.includes("multipart/form-data")) {
			return undefined
		}

		return this.text()
	}

	/**
	 * Resolved remote IP address.
	 *
	 * When `trust_proxy` is enabled, it reads from `x-forwarded-for`.
	 * Otherwise, it uses the direct remote address from uWS.
	 */
	get ip() {
		if (this._remote_ip) {
			return this._remote_ip
		}

		if (this._request_ended) {
			throw new Error(
				"Request.ip cannot be consumed after the Request/Response has ended.",
			)
		}

		const x_forwarded_for = this.headers["x-forwarded-for"]
		const trust_proxy = this.engine?.options.trust_proxy

		if (trust_proxy && x_forwarded_for) {
			// take the first IP in the x-forwarded-for chain (the original client)
			const commaIdx = x_forwarded_for.indexOf(",")
			this._remote_ip =
				commaIdx === -1
					? x_forwarded_for.trim()
					: x_forwarded_for.slice(0, commaIdx).trim()
		} else {
			this._remote_ip = array_buffer_to_string(
				this._raw_response.getRemoteAddressAsText(),
			)
		}

		return this._remote_ip
	}

	/**
	 * The proxy IP as reported by uWS.
	 */
	get proxy_ip() {
		if (this._remote_proxy_ip) {
			return this._remote_proxy_ip
		}
		if (this._request_ended) {
			throw new Error(
				"Request.proxy_ip cannot be consumed after the Request/Response has ended.",
			)
		}

		this._remote_proxy_ip = array_buffer_to_string(
			this._raw_response.getProxiedRemoteAddressAsText(),
		)
		return this._remote_proxy_ip
	}

	/**
	 * Throws an error indicating a method is not supported by this engine.
	 * Used for Express-compatible API surface methods that have no uWS equivalent.
	 */
	_throw_unsupported(name: string) {
		throw new Error(
			`ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Request.${name} which is unsupported.`,
		)
	}
}
