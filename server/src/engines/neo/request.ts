/**
 * @fileoverview Full HTTP request wrapper for the Neo engine.
 *
 * Wraps a raw uWS HttpRequest and provides high-level accessors for headers,
 * body parsing (JSON, text, urlencoded, buffer), cookies, IP resolution,
 * and path/query parameters.
 */

import cookie from "cookie"
import querystring from "fast-querystring"
import signature from "cookie-signature"

import type { HttpRequest, HttpResponse } from "uWebSockets.js"
import type { Request as BaseHttpRequest } from "../../classes/Handler/http"
import type { EngineAdaptor } from "../../classes/EngineAdaptor"
import type { Route } from "../../classes/Route"
import type { Server } from "../../server"
import type Response from "./response"

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
	constructor() {}
	/** Per-request local storage for middleware communication. */
	_locals!: any
	/** Whether the response stream is paused. */
	_paused!: boolean
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
	/** Request headers extracted synchronously. */
	_headers!: Record<string, string>
	/** The matched route for this request. */
	route!: Route<TServer> | null
	/** Whether all body chunks have been received. */
	_received!: boolean
	/** Total bytes received so far for the body. */
	_body_received_bytes!: number
	/** Has the onData listener been registered for body parsing? */
	_body_parser_on_data_registered!: boolean
	/** Parsed body (populated lazily by `.json()`, `.text()`, etc.). */
	_body!: any
	/** The type that `.parseBody()` resolved to. */
	_body_type!: string | null
	/** Raw body buffer, populated after body is fully received. */
	_body_raw!: Buffer | null
	/** Promise that resolves once all body data is received and parsed. */
	_body_promise!: Promise<any> | null
	/** Callback invoked when body data is fully received. */
	_onDone!: (() => void) | null

	/**
	 * Creates a Request instance from raw uWS objects.
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
		if (this._headers) {
			return this._headers
		}

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
		if (this._body_parser_on_data_registered) return true

		this._received = false
		this._body_received_bytes = 0
		this._body_parser_on_data_registered = true

		const chunks: Buffer[] = []
		const max_buffer = this.engine?.options.max_body_buffer ?? 1024 * 1024

		this._raw_response.onData((chunk: ArrayBuffer, is_last: boolean) => {
			if (response.completed) return

			if (chunk.byteLength > 0) {
				this._body_received_bytes += chunk.byteLength

				if (this._body_received_bytes > limit_bytes) {
					response.status(413).send("Payload Too Large")
					this._received = true
					return
				}

				const chunkCopy = Buffer.allocUnsafe(chunk.byteLength)
				chunkCopy.set(new Uint8Array(chunk))
				chunks.push(chunkCopy)

				if (
					this._body_received_bytes > max_buffer &&
					!this._body_promise
				) {
					this.pause()
				}
			}

			if (is_last) {
				this._received = true
				if (chunks.length === 0) {
					this._body_raw = Buffer.allocUnsafe(0)
				} else if (chunks.length === 1) {
					this._body_raw = chunks[0]
				} else {
					this._body_raw = Buffer.concat(
						chunks,
						this._body_received_bytes,
					)
				}

				if (this._onDone) {
					this._onDone()
					this._onDone = null
				}
			}
		})

		return true
	}

	/**
	 * Returns the entire request body as a Buffer.
	 */
	async buffer(): Promise<Buffer> {
		if (this._body_type === "buffer") {
			return this._body
		}

		await this.parseBody()

		return this._body_raw || Buffer.allocUnsafe(0)
	}

	/**
	 * Returns the entire request body as a string.
	 */
	async text(): Promise<string> {
		if (this._body_type === "text") {
			return this._body
		}

		await this.parseBody()

		return typeof this._body === "string" ? this._body : ""
	}

	/**
	 * Parses the request body as JSON.
	 */
	async json(default_value = {}): Promise<any> {
		if (this._body_type === "json") {
			return this._body
		}

		try {
			await this.parseBody()
		} catch (error) {
			if (default_value !== undefined) {
				return default_value
			}
			throw error
		}

		return this._body
	}

	/**
	 * Parses the request body as URL-encoded form data.
	 */
	async urlencoded(): Promise<any> {
		if (this._body_type === "urlencoded") {
			return this._body
		}

		await this.parseBody()

		return this._body
	}

	get locals() {
		if (!this._locals) {
			this._locals = Object.create(null)
		}

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
		if (this._url) {
			return this._url
		}

		this._url = this._path + (this._query_str ? "?" + this._query_str : "")

		return this._url
	}

	/** URL path (no query string). */
	get path() {
		return this._path
	}

	/** Parsed query string parameters. */
	get query() {
		if (this._query_parameters) {
			return this._query_parameters
		}

		this._query_parameters = querystring.parse(this._query_str)

		return this._query_parameters
	}

	/** URL path parameters extracted (e.g. `/user/:id` → `{ id: "42" }`). */
	get params() {
		return this._path_parameters
	}

	/**
	 * Parsed cookies from the `Cookie` header.
	 * Parsed lazily on first access.
	 */
	get cookies() {
		if (this._cookies) {
			return this._cookies
		}

		const header = this.headers["cookie"]
		this._cookies = header ? cookie.parse(header) : Object.create(null)

		return this._cookies
	}

	/** The parsed body. Populated after calling `.parseBody()`, `.json()`, `.text()`, etc. */
	get body() {
		return this._body
	}

	/**
	 * Automatically parses the request body based on `Content-Type`.
	 */
	async parseBody(): Promise<any> {
		if (this._body_promise) return this._body_promise

		this._body_promise = new Promise((resolve) => {
			if (this._received) {
				return resolve(this._finalize_body())
			}

			this._onDone = () => {
				resolve(this._finalize_body())
			}
		})

		return this._body_promise
	}

	/**
	 * Decodes the raw body buffer based on Content-Type.
	 */
	_finalize_body() {
		if (this._body !== undefined) return this._body

		const raw = this._body_raw || Buffer.allocUnsafe(0)
		const contentType = this._raw_request.getHeader("content-type") || ""

		if (contentType.includes("application/json")) {
			try {
				this._body = JSON.parse(raw.toString())
				this._body_type = "json"
			} catch {
				this._body = {}
				this._body_type = "json"
			}
		} else if (contentType.includes("application/x-www-form-urlencoded")) {
			this._body = querystring.parse(raw.toString())
			this._body_type = "urlencoded"
		} else if (
			contentType.includes("text/") ||
			contentType.includes("application/xml") ||
			contentType.includes("application/javascript") ||
			!contentType
		) {
			this._body = raw.toString()
			this._body_type = "text"
		} else {
			this._body = raw
			this._body_type = "buffer"
		}

		return this._body
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

		const x_forwarded_for = this._raw_request.getHeader("x-forwarded-for")
		const trust_proxy = this.engine?.options.trust_proxy

		if (trust_proxy && x_forwarded_for) {
			// take the first IP in the x-forwarded-for chain (the original client)
			const commaIdx = x_forwarded_for.indexOf(",")
			this._remote_ip =
				commaIdx === -1
					? x_forwarded_for.trim()
					: x_forwarded_for.slice(0, commaIdx).trim()
		} else {
			this._remote_ip = Buffer.from(
				this._raw_response.getRemoteAddressAsText(),
			).toString()
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

		this._remote_proxy_ip = Buffer.from(
			this._raw_response.getProxiedRemoteAddressAsText(),
		).toString()
		return this._remote_proxy_ip
	}
}
