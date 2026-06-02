import util from "util"
import cookie from "cookie"
import stream from "stream"
import busboy from "busboy"
import querystring from "querystring"
import signature from "cookie-signature"

import {
	array_buffer_to_string,
	copy_array_buffer_to_uint8array,
} from "./utils"
import MultipartField from "./MultipartField"

import type { HttpRequest, HttpResponse } from "uWebSockets.js"
import type { Request as BaseHttpRequest } from "../../classes/Handler/http"
import type { EngineAdaptor } from "../../classes/EngineAdaptor"
import type { Route } from "../../classes/Route"
import type { Server } from "../../server"
import type Response from "./response"

const utf8Decoder = new util.TextDecoder("utf-8")

export default class Request<TServer extends Server>
	extends stream.Readable
	implements BaseHttpRequest
{
	_locals: any = null
	_paused: boolean = false
	_request_ended: boolean = false

	_method: string = ""
	_url: string = ""
	_path: string = ""
	_query: string = ""
	_remote_ip: string = ""
	_remote_proxy_ip: string = ""
	_cookies: any = null
	_path_parameters: any = null
	_query_parameters: any = null

	_start_time: string = ""
	_start_time_hr: number = 0

	_raw_request: HttpRequest
	_raw_response: HttpResponse

	ctx: Record<string, any> = Object.create(null)
	headers: Record<string, string> = Object.create(null)
	route: Route<TServer> | null = null
	received: boolean = true

	_body_parser_mode: number = 0
	_body_limit_bytes: number = 0
	_body_received_bytes: number = 0
	_body_expected_bytes: number = -1
	_body_parser_flushing: boolean = false
	_body_chunked_transfer: boolean = false
	_body_parser_buffered: any[] | null = null
	_body_parser_passthrough: any = null

	_body: any = null
	_body_type: string | null = null
	_body_raw: Buffer | null = null

	_received_data_promise: Promise<Buffer> | null = null
	_buffer_promise: Promise<Buffer> | null = null
	_text_promise: Promise<string> | null = null
	_json_promise: Promise<any> | null = null
	_urlencoded_promise: Promise<any> | null = null
	_multipart_promise: Promise<void> | null = null

	_read() {
		if (this._body_parser_mode === 0) {
			this._body_parser_mode = 2
			this._body_parser_flush_buffered()
		}

		this.resume()
	}

	get engine(): EngineAdaptor | null {
		return this.route?.engine || null
	}

	constructor(
		route: Route<TServer>,
		raw_request: HttpRequest,
		raw_response: HttpResponse,
	) {
		super(route.streaming?.readable || {})

		this._start_time = new Date().toISOString()
		this._start_time_hr = performance.now()

		this.route = route
		this._raw_request = raw_request
		this._raw_response = raw_response

		this.ctx = route.ctx || Object.create(null)

		this._query = raw_request.getQuery()
		this._path = raw_request.getUrl()

		const raw_method = raw_request.getMethod()
		this._method =
			raw_method === "del" ? "DELETE" : raw_method.toUpperCase()

		raw_request.forEach((key, value) => {
			this.headers[key] = value
		})

		const num_path_parameters = route.pathParametersKey.length

		if (num_path_parameters > 0) {
			this._path_parameters = Object.create(null)

			for (let i = 0; i < num_path_parameters; i++) {
				const parts = route.pathParametersKey[i]

				this._path_parameters[parts[0]] = raw_request.getParameter(
					parts[1],
				)
			}
		}
	}

	get raw(): HttpRequest {
		return this._raw_request
	}

	pause(): this {
		if (!this._paused) {
			this._paused = true
			this._raw_response.pause()
			super.pause()
		}

		return this
	}

	resume(): this {
		if (this._paused) {
			this._paused = false
			this._raw_response.resume()
		}

		super.resume()

		return this
	}

	// @ts-ignore
	pipe<T extends NodeJS.WritableStream>(
		destination: T,
		options?: stream.PipeOptions,
	): this {
		super.pipe(destination, options)
		super.resume()
		return this
	}

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

		if (content_length > 0 || is_chunked_transfer) {
			const is_first_run = this._body_expected_bytes === -1

			this._body_limit_bytes = limit_bytes
			this._body_expected_bytes = is_chunked_transfer ? 0 : content_length
			this._body_chunked_transfer = is_chunked_transfer

			if (is_first_run) {
				this.received = false
				this._body_received_bytes = 0
				this._body_parser_buffered = []
				this._raw_response.onData((chunk, is_last) =>
					this._body_parser_on_chunk(response, chunk, is_last),
				)
			}

			this._body_parser_enforce_limit(response)
		}

		return !this._body_parser_flushing
	}

	_body_parser_stop() {
		if (this._body_expected_bytes === -1 || this._body_parser_flushing)
			return

		this._body_parser_flushing = true
		this.push(null)
		this.resume()
	}

	_body_parser_enforce_limit(response: Response<TServer>) {
		const incoming_bytes = Math.max(
			this._body_received_bytes,
			this._body_expected_bytes,
		)

		if (incoming_bytes > this._body_limit_bytes) {
			this._body_parser_stop()

			if (!response.initiated) {
				if (this.engine?.options.fast_abort) {
					response.close()
				} else if (this.received) {
					response.status(413).send()
				}
			}
			return true
		}
		return false
	}

	_body_parser_on_chunk(
		response: Response<TServer>,
		chunk: ArrayBuffer,
		is_last: boolean,
	) {
		if (!chunk.byteLength && !is_last) return

		this._body_received_bytes += chunk.byteLength

		if (!this._body_parser_flushing) {
			const limited = this._body_parser_enforce_limit(response)

			if (!limited) {
				switch (this._body_parser_mode) {
					case 0:
						this._body_parser_buffered!.push(
							copy_array_buffer_to_uint8array(chunk),
						)
						if (
							this._body_received_bytes >
							(this.engine?.options.max_body_buffer ?? Infinity)
						)
							this.pause()
						break
					case 1:
						this._body_parser_passthrough(
							this._body_chunked_transfer
								? copy_array_buffer_to_uint8array(chunk)
								: new Uint8Array(chunk),
							is_last,
						)
						break
					case 2:
						if (!this.push(copy_array_buffer_to_uint8array(chunk)))
							this.pause()
						if (is_last) this.push(null)
						break
				}
			}
		}

		if (is_last) {
			this.received = true

			this.emit("received", this._body_received_bytes)

			if (this._body_parser_flushing)
				this._body_parser_enforce_limit(response)
		}
	}

	_body_parser_flush_buffered() {
		if (this._body_parser_buffered) {
			switch (this._body_parser_mode) {
				case 1:
					for (
						let i = 0;
						i < this._body_parser_buffered.length;
						i++
					) {
						this._body_parser_passthrough(
							this._body_parser_buffered[i],
							i === this._body_parser_buffered.length - 1
								? this.received
								: false,
						)
					}
					break
				case 2:
					for (
						let i = 0;
						i < this._body_parser_buffered.length;
						i++
					) {
						this.push(Buffer.from(this._body_parser_buffered[i]))
					}
					if (this.received) this.push(null)
					break
			}
		}

		this._body_parser_buffered = null
		this.resume()
	}

	_body_parser_get_received_data() {
		if (this._received_data_promise) return this._received_data_promise

		if (!this._body_chunked_transfer && this._body_expected_bytes <= 0) {
			return Promise.resolve(Buffer.allocUnsafe(0))
		}

		this._received_data_promise = new Promise<Buffer>((resolve) => {
			if (this._body_chunked_transfer) {
				const chunks: any[] = []

				this._body_parser_passthrough = (
					chunk: any,
					is_last: boolean,
				) => {
					chunks.push(chunk)

					if (is_last) {
						let offset = 0

						const buffer = Buffer.allocUnsafe(
							this._body_received_bytes,
						)

						for (let i = 0; i < chunks.length; i++) {
							buffer.set(chunks[i], offset)
							offset += chunks[i].byteLength
						}

						resolve(buffer)
					}
				}
			} else {
				const buffer = Buffer.allocUnsafe(this._body_expected_bytes)
				let offset = 0

				this._body_parser_passthrough = (
					chunk: any,
					is_last: boolean,
				) => {
					buffer.set(chunk, offset)
					offset += chunk.byteLength
					if (is_last) resolve(buffer)
				}
			}
			this._body_parser_mode = 1
			this._body_parser_flush_buffered()
		})
		return this._received_data_promise
	}

	async _resolve_raw_body(): Promise<Buffer> {
		if (this._body_raw) return this._body_raw

		this._body_raw = await this._body_parser_get_received_data()

		return this._body_raw
	}

	buffer() {
		if (this._buffer_promise) return this._buffer_promise

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
		value: stream.Readable | string,
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

	multipart(options: any, handler: any) {
		if (typeof options === "function") {
			handler = options
			options = {}
		}

		options = Object.assign({}, options)
		if (!options.headers) options.headers = this.headers

		if (typeof handler !== "function") {
			throw new Error(
				"HyperExpress: Request.multipart(handler) -> handler must be a Function.",
			)
		}
		if (this.readableEnded) {
			return Promise.resolve()
		}

		const content_type = this.headers["content-type"]
		if (!content_type || !/^(multipart\/.+);(.*)$/i.test(content_type)) {
			return Promise.resolve()
		}

		return new Promise((resolve, reject) => {
			const uploader = busboy(options)
			let finished = false

			const finish = async (error?: string | Error | null) => {
				if (finished) return
				finished = true

				let silent_error = false
				if (
					error instanceof Error &&
					error.message === "Unexpected end of form"
				)
					silent_error = true

				if (error && !silent_error) {
					reject(error)
				} else {
					if (this._multipart_promise) await this._multipart_promise
					resolve(null)
				}

				this._body_parser_stop()
				uploader.destroy()
			}

			uploader.once("error", finish)
			uploader.once("partsLimit", () => finish("PARTS_LIMIT_REACHED"))
			uploader.once("filesLimit", () => finish("FILES_LIMIT_REACHED"))
			uploader.once("fieldsLimit", () => finish("FIELDS_LIMIT_REACHED"))

			const on_field = (name: any, value: any, info: any) => {
				if (value instanceof stream.Readable) {
					value.once("error", finish)
				}

				this._on_multipart_field(handler, name, value, info).catch(
					finish,
				)
			}

			uploader.on("field", on_field)
			uploader.on("file", on_field)

			uploader.once("close", () => {
				if (this._multipart_promise) {
					this._multipart_promise.then(() => finish()).catch(finish)
				} else {
					finish()
				}
			})

			this.pipe(uploader)
		})
	}

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

		this._url = this._path + (this._query ? "?" + this._query : "")

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

		this._query_parameters = querystring.parse(this._query)

		return this._query_parameters
	}

	get body() {
		return this._body
	}

	async parseBody(): Promise<any> {
		if (this._body !== null) return this._body

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
				"HyperExpress.Request.ip cannot be consumed after the Request/Response has ended.",
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
				"HyperExpress.Request.proxy_ip cannot be consumed after the Request/Response has ended.",
			)
		}

		this._remote_proxy_ip = array_buffer_to_string(
			this._raw_response.getProxiedRemoteAddressAsText(),
		)
		return this._remote_proxy_ip
	}

	_throw_unsupported(name: string) {
		throw new Error(
			`ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Request.${name} which is unsupported with HyperExpress.`,
		)
	}
}
