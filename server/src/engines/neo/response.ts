import cookie from "cookie"
import signature from "cookie-signature"
import { STATUS_CODES } from "http"
import mime_types from "mime-types"
import stream from "stream"

import LiveFile from "./LiveFile"
import SSEventStream from "./SSEventStream"

import type { HttpResponse } from "uWebSockets.js"
import type { EngineAdaptor } from "../../classes/EngineAdaptor"
import type { Route } from "../../classes/Route"
import type { Server } from "../../server"
import type { Response as BaseHttpResponse } from "../../classes/Handler/http"

const FilePool: Record<string, any> = Object.create(null)

const stringify = JSON.stringify

const STATUS_CACHE: Record<number, string> = Object.create(null)

for (const code in STATUS_CODES) {
	STATUS_CACHE[code as unknown as number] = `${code} ${STATUS_CODES[code]}`
}

export default class Response<TServer extends Server>
	extends stream.Writable
	implements BaseHttpResponse
{
	_sse: SSEventStream | null = null
	_locals: any = null
	route: Route<TServer> | null = null
	_corked: boolean = false
	_streaming: boolean = false
	_middleware_cursor: number = -1
	_wrapped_request: any = null
	_upgrade_socket: any = null
	_raw_response: HttpResponse | null = null
	_status_code: number = 200
	_status_message: string | null = null

	_headers: Record<string, string | string[]> = Object.create(null)
	_cookies: Record<string, string> | null = null

	_cork: boolean = false
	completed: boolean = false
	initiated: boolean = false

	get engine(): EngineAdaptor | null {
		return this.route?.engine ?? null
	}

	constructor(raw_response: HttpResponse) {
		super()
		this._raw_response = raw_response

		raw_response.onAborted(() => {
			if (this.completed) return
			this.completed = true

			this.route?.server.engine._resolve_pending_request()
			this._wrapped_request._body_parser_stop()

			if (this.listenerCount("abort") > 0) {
				this.emit("abort", this._wrapped_request, this)
			}

			if (this.listenerCount("close") > 0) {
				this.emit("close", this._wrapped_request, this)
			}
		})
	}

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

	atomic(handler: Function): this {
		if (!this.completed) this._raw_response!.cork(handler as any)
		return this
	}

	status(code: number, message?: string): this {
		this._status_code = code
		if (message !== undefined) this._status_message = message
		return this
	}

	type(mime_type: string): this {
		if (mime_type.charCodeAt(0) === 46) {
			mime_type = mime_type.slice(1)
		}

		this._headers["content-type"] =
			mime_types.contentType(mime_type) || "text/plain"

		return this
	}

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

		if (this._cookies === null) this._cookies = Object.create(null)

		this._cookies![name] = cookie.serialize(name, value as any, options)
		return this
	}

	upgrade(context?: any) {
		if (this.completed) return

		if (this._upgrade_socket == null) {
			throw new Error(
				"HyperExpress: You cannot upgrade a request that does not come from an upgrade handler. No upgrade socket was found.",
			)
		}

		this._wrapped_request.resume()

		if (this._cork && !this._corked) {
			this._corked = true
			return this.atomic(() => this.upgrade(context))
		}

		const headers = this._wrapped_request.headers

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

	_initiate_response(): boolean {
		if (this.initiated) return false

		this.initiated = true
		this._wrapped_request.resume()

		const raw = this._raw_response!

		if (this._status_message) {
			raw.writeStatus(`${this._status_code} ${this._status_message}`)
		} else if (
			this._status_code !== 200 ||
			STATUS_CACHE[this._status_code]
		) {
			raw.writeStatus(
				STATUS_CACHE[this._status_code] || `${this._status_code} OK`,
			)
		}

		for (const name in this._headers) {
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
			for (const name in this._cookies) {
				raw.writeHeader("set-cookie", this._cookies[name])
			}
		}

		return true
	}

	_drain_handler: ((offset: number) => boolean) | null = null

	drain(handler: (offset: number) => boolean) {
		const is_first_time = this._drain_handler === null
		this._drain_handler = handler

		if (is_first_time) {
			this._raw_response!.onWritable((offset) => {
				const output = this._drain_handler!(offset)

				if (typeof output !== "boolean") {
					throw new Error(
						"HyperExpress: Response.drain(handler) -> handler must return a boolean value stating if the write was successful or not.",
					)
				}
				return output
			})
		}
	}

	_write(
		chunk: any,
		encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	) {
		if (chunk.chunk && chunk.encoding) {
			const temp = chunk
			chunk = temp.chunk
			encoding = temp.encoding

			if (!callback) {
				callback = temp.callback
			}
		}

		if (!this.completed) {
			if (!this._streaming) {
				this._streaming = true
				this.once("finish", () => this.send())
			}

			this._stream_chunk(chunk)
				.then(() => callback())
				.catch((error) => callback(error))
		} else {
			callback()
		}
	}

	_writev(
		chunks: Array<{ chunk: any; encoding: BufferEncoding }>,
		callback: (error?: Error | null) => void,
		index: number = 0,
	) {
		this._write(chunks[index], null as any, (error) => {
			if (error) return callback(error)

			if (typeof (chunks[index] as any).callback === "function") {
				;(chunks[index] as any).callback()
			}

			if (index < chunks.length - 1) {
				this._writev(chunks, callback, index + 1)
			} else {
				callback()
			}
		})
	}

	send(body?: any, close_connection?: boolean): this {
		if (this.completed) return this

		if (this.writableLength) {
			if (body) {
				this.write(body)
			}

			this.end()
			return this
		}

		if (this._cork && !this._corked) {
			this._corked = true
			return this.atomic(() => this.send(body, close_connection))
		}

		this._initiate_response()

		if (!this._wrapped_request.received) {
			this._wrapped_request._body_parser_stop()
			return this._wrapped_request.once("received", () =>
				this.atomic(() => this.send(body, close_connection)),
			) as this
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

		if (!this._streaming && this.listenerCount("finish") > 0) {
			this.emit("finish", this._wrapped_request, this)
		}

		this.completed = true
		this.engine?._resolve_pending_request()

		if (this.listenerCount("close") > 0) {
			this.emit("close", this._wrapped_request, this)
		}

		return this
	}

	_uws_write_chunk(chunk: any, total_size?: number): [boolean, boolean] {
		if (total_size) {
			return this._raw_response!.tryEnd(chunk, total_size)
		}

		return [this._raw_response!.write(chunk), false]
	}

	_stream_chunk(chunk: any, total_size?: number): Promise<void> {
		if (this.completed) return Promise.resolve()

		return new Promise((resolve) =>
			this.atomic(() => {
				if (this.completed) return resolve()

				this._initiate_response()

				const write_offset = this._raw_response!.getWriteOffset()
				const [sent] = this._uws_write_chunk(chunk, total_size)
				if (sent) return resolve()

				this.drain((offset) => {
					if (this.completed || !total_size) {
						resolve()
						return true
					}

					const remaining = chunk.slice(offset - write_offset)
					const [flushed] = this._uws_write_chunk(
						remaining,
						total_size,
					)
					if (flushed) resolve()

					return flushed
				})
			}),
		)
	}

	async stream(readable: stream.Readable, total_size?: number) {
		if (!(readable instanceof stream.Readable)) {
			throw new Error(
				"HyperExpress: Response.stream(readable, total_size) -> readable must be a Readable stream.",
			)
		}

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

	close() {
		if (this.completed) return

		this.completed = true
		this.engine?._resolve_pending_request()
		this._wrapped_request._body_parser_stop()
		this._wrapped_request.resume()
		this._raw_response!.close()
	}

	redirect(url: string): boolean {
		if (this.completed) return false
		return this.status(302).header("location", url).send() as any
	}

	json(body: any): this {
		this._headers["content-type"] = "application/json"
		return this.send(stringify(body))
	}

	jsonp(body: any, name?: string): this {
		const query_parameters = this._wrapped_request.query_parameters
		const method_name = query_parameters["callback"] || name

		this._headers["content-type"] = "application/javascript"
		return this.send(`${method_name}(${stringify(body)})`)
	}

	html(body: any): this {
		this._headers["content-type"] = "text/html"
		return this.send(body)
	}

	async _send_file(live_file: any, callback?: Function) {
		if (!live_file.is_ready) await live_file.ready()

		this.type(live_file.extension)
		this.send(live_file.buffer)

		if (callback) setImmediate(() => callback(FilePool))
	}

	file(path: string, callback?: Function): this {
		if (FilePool[path])
			return this._send_file(FilePool[path], callback) as any

		FilePool[path] = new LiveFile({ path })
		FilePool[path].on("error", (error: any) => {
			throw error
		})

		this._send_file(FilePool[path], callback) as any
		return this
	}

	attachment(path?: string, name?: string): this {
		if (path === undefined)
			return this.header("content-disposition", "attachment")

		const lastSlash = path.lastIndexOf("/")
		const final_name =
			name || (lastSlash !== -1 ? path.slice(lastSlash + 1) : path)

		const lastDot = final_name.lastIndexOf(".")
		const extension = lastDot !== -1 ? final_name.slice(lastDot + 1) : ""

		return this.header(
			"content-disposition",
			`attachment; filename="${final_name}"`,
		).type(extension)
	}

	download(path: string, filename?: string): this {
		return this.attachment(path, filename).file(path)
	}

	get locals(): Record<string, any> {
		if (!this._locals) this._locals = Object.create(null)
		return this._locals
	}

	get raw(): HttpResponse | null {
		return this._raw_response
	}
	get aborted(): boolean {
		return this.completed
	}
	get upgrade_socket(): any {
		return this._upgrade_socket
	}

	get sse(): SSEventStream | undefined {
		if (this._wrapped_request.method === "GET") {
			if (this._sse === null) {
				this._sse = new SSEventStream()
				this._sse._response = this
			}
			return this._sse
		}
	}

	get write_offset(): number {
		return this.completed ? -1 : this._raw_response!.getWriteOffset()
	}

	get statusCode() {
		return this._status_code
	}
	set statusCode(value) {
		this._status_code = value
	}
	get statusMessage() {
		return this._status_message
	}
	set statusMessage(value) {
		this._status_message = value
	}
	get headersSent() {
		return this.initiated
	}

	append(name: string, values: any) {
		return this.header(name, values)
	}
	setHeader(name: string, values: any) {
		return this.header(name, values)
	}
	writeHeaders(headers: any) {
		for (const key in headers) this.header(key, headers[key])
	}
	setHeaders(headers: any) {
		this.writeHeaders(headers)
	}
	writeHeaderValues(name: string, values: any) {
		for (let i = 0; i < values.length; i++) this.header(name, values[i])
	}
	getHeader(name: string) {
		return this._headers[name]
	}
	removeHeader(name: string) {
		delete this._headers[name]
	}
	setCookie(name: string, value: any, options: any) {
		return this.cookie(name, value, null, options)
	}
	hasCookie(name: string) {
		return this._cookies !== null && this._cookies[name] !== undefined
	}
	removeCookie(name: string) {
		return this.cookie(name, null)
	}
	clearCookie(name: string) {
		return this.cookie(name, null)
	}
	end(data?: any) {
		return this.send(data)
	}
	format() {
		this._throw_unsupported("format()")
	}

	get(name: string) {
		const values = this._headers[name]
		if (values)
			return Array.isArray(values)
				? values
				: (values as any).length
					? values[0]
					: values
	}

	links(links: any) {
		const chunks: string[] = []
		for (const rel in links) {
			chunks.push(`<${links[rel]}>; rel="${rel}"`)
		}
		this.header("link", chunks.join(", "))
	}

	location(path: string) {
		this._headers["location"] = path as any
		return this
	}

	render() {
		this._throw_unsupported("render()")
	}
	sendFile(path: string) {
		return this.file(path)
	}
	sendStatus(status_code: number) {
		this._status_code = status_code
		return this.send()
	}

	set(field: any, value: any) {
		if (typeof field === "object") {
			for (const key in field) this.header(key, field[key])
		} else {
			this.header(field, value)
		}
	}

	vary(name: string) {
		this._headers["vary"] = name as any
		return this
	}

	_throw_unsupported(name: string) {
		throw new Error(
			`ERR_INCOMPATIBLE_CALL: One of your middlewares or route logic tried to call Response.${name} which is unsupported with HyperExpress.`,
		)
	}
}
