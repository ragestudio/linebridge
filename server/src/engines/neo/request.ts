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

export default class Request<
	TServer extends Server,
> implements BaseHttpRequest {
	_locals!: any
	_paused!: boolean
	_request_ended!: boolean
	_method!: string
	_url!: string
	_path!: string
	_query_str!: string
	_remote_ip!: string
	_remote_proxy_ip!: string
	_cookies!: any
	_path_parameters!: any
	_query_parameters!: any
	_raw_request!: HttpRequest
	_raw_response!: HttpResponse
	ctx!: Record<string, any>
	_headers!: Record<string, string> | null
	route!: Route<TServer> | null
	_received!: boolean
	_body_received_bytes!: number
	_body_expected_bytes!: number
	_body_chunked_transfer!: boolean
	_body_parser_buffered!: Buffer[] | null
	_body_parser_on_data_registered!: boolean
	_body!: any
	_body_type!: string | null
	_body_raw!: Buffer | null
	_received_data_promise!: Promise<Buffer> | null
	_buffer_promise!: Promise<Buffer> | null
	_text_promise!: Promise<string> | null
	_json_promise!: Promise<any> | null
	_urlencoded_promise!: Promise<any> | null
	_multipart_promise!: Promise<void> | null
	_onDone!: (() => void) | null

	constructor() {}

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

		const rawMethod = raw_request.getMethod()
		req._method = rawMethod === "del" ? "DELETE" : rawMethod.toUpperCase()

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

	get engine(): EngineAdaptor | null {
		return this.route?.engine || null
	}

	get raw(): HttpRequest {
		return this._raw_request
	}

	get headers(): Record<string, string> {
		if (this._headers) return this._headers
		this._headers = {}
		this._raw_request.forEach((key: string, value: string) => {
			this._headers![key] = value
		})
		return this._headers
	}

	pause(): this {
		if (!this._paused) {
			this._paused = true
			this._raw_response.pause()
		}
		return this
	}

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

	// 	// body parser is no longer active — pipe takes over
	// 	this._body_parser_on_data_registered = false

	// 	// if the complete body was already buffered, just end the target
	// 	if (this._received) {
	// 		target.end()
	// 		return this
	// 	}

	// 	// body is still arriving — register onData for the remaining chunks
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

	sign(string: string, secret: string) {
		return signature.sign(string, secret)
	}
	unsign(signed_value: string, secret: string) {
		const unsigned_value = signature.unsign(signed_value, secret)
		return unsigned_value !== false ? unsigned_value : undefined
	}

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

			this._raw_response.onData((chunk: ArrayBuffer, is_last: boolean) =>
				this._body_parser_on_chunk(response, chunk, is_last),
			)
		}

		return true
	}

	_body_parser_stop() {
		this._body_parser_flush_buffered()
	}

	_body_parser_on_chunk(
		response: Response<TServer>,
		chunk: ArrayBuffer,
		is_last: boolean,
	) {
		// console.log(
		// 	`[DEBUG] _body_parser_on_chunk called. chunk_len: ${chunk.byteLength}, is_last: ${is_last}, _onDone_exists: ${!!this._onDone}`,
		// )
		// response already sent — ignore remaining body chunks
		if (response.completed) return

		if (!chunk.byteLength && !is_last) return

		this._body_received_bytes += chunk.byteLength

		if (this._body_parser_buffered) {
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

		if (is_last) {
			this._received = true

			if (this._onDone) {
				this._onDone()
				this._onDone = null
			}
		}
	}

	_body_parser_flush_buffered() {
		if (this._body_parser_buffered) {
			this._body_parser_buffered = null
		}
		this.resume()
	}

	_body_parser_get_received_data(): Promise<Buffer> {
		// console.log(
		// 	`[DEBUG] _body_parser_get_received_data called. _received: ${this._received}`,
		// )
		if (this._received_data_promise) return this._received_data_promise

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

		this._received_data_promise = new Promise<Buffer>((resolve, reject) => {
			if (this._received && this._body_parser_buffered) {
				const result = Buffer.concat(this._body_parser_buffered)
				this._body_raw = result
				this._body_parser_buffered = null
				resolve(result)
				return
			}

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

	async _resolve_raw_body(): Promise<Buffer> {
		if (this._body_raw) return this._body_raw
		this._body_raw = await this._body_parser_get_received_data()
		return this._body_raw
	}

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

	_uint8_to_string(uint8: Uint8Array, encoding: string = "utf-8") {
		if (encoding === "utf-8" || encoding === "utf8") {
			return utf8Decoder.decode(uint8)
		}

		return new util.TextDecoder(encoding).decode(uint8)
	}

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

	async _on_multipart_field(
		handler: Function,
		name: string,
		value: any,
		info: any,
	) {
		const field = new MultipartField(name, value, info)

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

	get locals() {
		if (!this._locals) this._locals = Object.create(null)
		return this._locals
	}

	get paused() {
		return this._paused
	}
	get method() {
		return this._method
	}
	get url() {
		if (this._url) return this._url
		this._url = this._path + (this._query_str ? "?" + this._query_str : "")
		return this._url
	}
	get path() {
		return this._path
	}
	get query() {
		return this._query_parameters || {}
	}
	get params() {
		return this._path_parameters || {}
	}

	get cookies() {
		if (this._cookies) return this._cookies
		const header = this.headers["cookie"]
		this._cookies = header ? cookie.parse(header) : Object.create(null)
		return this._cookies
	}

	get path_parameters() {
		return this._path_parameters || {}
	}

	get query_parameters() {
		if (this._query_parameters) return this._query_parameters
		this._query_parameters = querystring.parse(this._query_str)
		return this._query_parameters
	}

	get body() {
		return this._body
	}

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

	_throw_unsupported(name: string) {
		throw new Error(
			`ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Request.${name} which is unsupported.`,
		)
	}
}
