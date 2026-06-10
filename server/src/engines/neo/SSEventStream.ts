import type { SSEventStream as ISSEventStream } from "../../types"

interface SSEResponse {
	initiated: boolean
	completed: boolean
	_corked: boolean
	_raw_response: {
		cork(cb: () => void): void
		writeStatus(status: string): void
		write(chunk: string): boolean
		writeHeader(key: string, value: string): void
	} | null
	header(name: string, value: string): any
	write(data: string): boolean
	send(): any
}

export class SSEventStream implements ISSEventStream {
	_response!: SSEResponse

	#wrote_headers = false
	// true while inside the request handler's implicit uWS cork.
	// reset via process.nextTick so all sync writes in the handler
	// go direct, and any async writes (timers, microtasks) use cork.
	#inside_handler_cork = true

	_initiate_sse_stream(): boolean {
		if (this._response.initiated) return false
		if (this.#wrote_headers) return false
		this.#wrote_headers = true

		// mark as initiated and disable the wrapper's cork machinery
		// so the framework does not buffer or auto-close this response
		this._response.initiated = true
		this._response._corked = true

		// schedule flag reset. process.nextTick fires before microtasks
		// and timers, so any async write will see cork disabled.
		process.nextTick(() => {
			this.#inside_handler_cork = false
		})

		// write SSE headers directly to uWS.
		// this runs during the request handler so we are inside uWS's
		// implicit cork - no explicit cork needed.
		const raw = this._response._raw_response!
		raw.writeStatus("200 OK")
		raw.writeHeader("content-type", "text/event-stream")
		raw.writeHeader("cache-control", "no-cache")
		raw.writeHeader("connection", "keep-alive")
		raw.writeHeader("x-accel-buffering", "no")

		return true
	}

	_write(data: string): boolean {
		this._initiate_sse_stream()

		const raw = this._response._raw_response!
		let ok = false

		try {
			if (this.#inside_handler_cork) {
				// inside handler: uWS implicit cork protects us
				ok = raw.write(data)
			} else {
				// outside handler (timers/intervals/async): must cork
				raw.cork(() => {
					ok = raw.write(data)
				})
			}
		} catch {
			// connection was aborted - mark as completed so active getter
			// returns false and callers can stop their timers
			this._response.completed = true
			return false
		}

		return ok
	}

	open(): boolean {
		return this.comment("open")
	}

	close(): boolean {
		return this._response.send()
	}

	comment(data: string): boolean {
		return this._write(`: ${data}\n`)
	}

	send(id: string, event: string, data: string): boolean
	send(event: string, data: string): boolean
	send(data: string): boolean
	send(id: string, event?: string, data?: string): boolean {
		const _id = id && event && data ? id : undefined
		const _event = id && event ? (_id ? event : id) : undefined
		const _data = data || event || id

		const parts: string[] = []
		if (_id) parts.push(`id: ${_id}`)
		if (_event) parts.push(`event: ${_event}`)
		if (_data) parts.push(`data: ${_data}`)
		parts.push("", "")

		return this._write(parts.join("\n"))
	}

	get active(): boolean {
		return !this._response.completed
	}
}

export default SSEventStream
