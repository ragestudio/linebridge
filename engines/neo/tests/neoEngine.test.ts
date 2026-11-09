import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

import { Server } from "linebridge"
import NeoEngine from "../src/engine"
import Response from "../src/response"
import { HandlerKind, Handler } from "linebridge/classes/Handler/index"
import { Route } from "linebridge/classes/Route/index"

describe("NeoEngine", () => {
	let server: Server

	beforeEach(() => {
		// Mock global ToBoolean
		;(global as any).ToBoolean = (str: any) =>
			str === "true" || str === true || str === 1 || str === "1"

		// Mock environment logic if necessary
		vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(console, "info").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
		if (server) {
			server._fireClose()
		}
	})

	it("should initialize the NeoEngine as the default engine", () => {
		server = new Server({ useEngine: "neo" })
		const engine = new NeoEngine(server)
		server.engine = engine
		expect(server.engine).toBeInstanceOf(NeoEngine)
	})

	it("should initialize uWebsockets app when initialize() is called", async () => {
		server = new Server({ useEngine: "neo" })
		const engine = new NeoEngine(server)
		server.engine = engine

		await engine.initialize()

		// Verify that uws app is created
		expect(engine.uws).toBeDefined()
		expect(engine.uws).not.toBeNull()
		// Also verify that the default catch-all route was registered
		expect(engine.registers.size).toBeGreaterThan(0)
	})

	it("should register middlewares", () => {
		server = new Server({ useEngine: "neo" })
		const engine = new NeoEngine(server)
		server.engine = engine

		const mwHandler = new Handler<HandlerKind.middleware>({
			kind: HandlerKind.middleware,
			engine: engine,
			fn: (req, res, next) => next(),
		})

		engine.register_middleware(mwHandler as any)
		expect(engine.middlewares.length).toBe(1)
		expect(engine.middlewares[0]).toBe(mwHandler)
	})

	it("should register routes", async () => {
		server = new Server({ useEngine: "neo" })
		const engine = new NeoEngine(server)
		server.engine = engine

		await engine.initialize()

		const route = new Route()
		route.method = "get"
		route.path = "/test"
		route.fn = () => {}

		engine.register(route)
		expect(engine.registers.size).toBe(2)
	})

	it("should correctly handle pending requests tracking", () => {
		server = new Server({ useEngine: "neo" })
		const engine = new NeoEngine(server)
		server.engine = engine

		engine.pending_requests_count = 2

		let handlerCalled = false
		engine.pending_requests_zero_handler = () => {
			handlerCalled = true
		}

		engine._resolve_pending_request()
		expect(engine.pending_requests_count).toBe(1)
		expect(handlerCalled).toBe(false)

		engine._resolve_pending_request()
		expect(engine.pending_requests_count).toBe(0)
		expect(handlerCalled).toBe(true)

		// A third call shouldn't drop it below zero normally, but let's test what the implementation does
		engine._resolve_pending_request()
		expect(engine.pending_requests_count).toBe(0) // The if (count < 1) return protects it
	})
})

import { expectTypeOf } from "vitest"
import { EngineAdaptor } from "linebridge/classes/EngineAdaptor/index"
import type RTEngine from "linebridge/classes/RtEngine/index"

describe("NeoEngine Type Inference", () => {
	it("should satisfy the EngineAdaptor interface", () => {
		// Assert that NeoEngine can be assigned to EngineAdaptor
		expectTypeOf<NeoEngine>().toMatchTypeOf<EngineAdaptor>()
	})

	it("should correctly type public methods and properties", () => {
		const engine = new NeoEngine(new Server())

		// WebSockets property
		expectTypeOf(engine.ws).toEqualTypeOf<RTEngine | null>()

		// uWS App instance (has to be explicitly tested against the underlying templated app type)
		// engine.uws is typed as uwsEngine | null in NeoEngine
		expectTypeOf(engine.uws).not.toBeAny()

		// register method expects a Route
		expectTypeOf(engine.register).toEqualTypeOf<(route: Route) => void>()

		// register_middleware expects a MiddlewareHandlerFunction or a Handler wrapper
		expectTypeOf(engine.register_middleware).toBeFunction()

		// publish method parameters (topic: string | ArrayBuffer, message: string | ArrayBuffer, etc)
		// Since uWebSockets.js RecognizedString is basically string | ArrayBuffer | Buffer
		expectTypeOf(engine.publish).toBeCallableWith(
			"topic",
			"message",
			true,
			true,
		)

		// num_of_subscribers returns a number or undefined
		expectTypeOf(engine.num_of_subscribers).returns.toMatchTypeOf<
			number | undefined
		>()

		// listen returns Promise<void> or Promise<boolean> (depending on how it was bound)
		expectTypeOf(engine.listen).returns.resolves.toBeVoid()
		expectTypeOf(engine.close).returns.resolves.toBeBoolean()
	})
})

function createRawResponse(calls: string[]) {
	return {
		cork(callback: () => void) {
			calls.push("cork")
			callback()
		},
		writeStatus(status: string) {
			calls.push(`status:${status}`)
		},
		writeHeader(name: string) {
			calls.push(`header:${name}`)
		},
		write() {
			calls.push("write")
			return true
		},
		tryEnd() {
			calls.push("tryEnd")
			return [true, false] as [boolean, boolean]
		},
		end() {
			calls.push("end")
		},
		endWithoutBody() {
			calls.push("endWithoutBody")
		},
		getWriteOffset() {
			return 0
		},
		onWritable() {},
		onAborted() {},
	}
}

function createResponse(raw: any) {
	const response: any = new Response()

	response._raw_response = raw
	response._headers = {}
	response._has_headers = false
	response._status_code = 200
	response._status_message = null
	response._cookies = null
	response._events = null
	response._streaming = false
	response._cork = true
	response._corked = false
	response._drain_handler = null
	response._engine = null

	return response
}

describe("Response send", () => {
	it("corks default 200 responses without redundant writeStatus", () => {
		const calls: string[] = []
		const response = createResponse(createRawResponse(calls))

		response.send("ok")

		expect(calls).toEqual(["cork", "end"])
	})

	it("lets the first header write the default status", () => {
		const calls: string[] = []
		const response = createResponse(createRawResponse(calls))

		response.header("x-test", "1").send("ok")

		expect(calls).toEqual(["cork", "header:x-test", "end"])
	})

	it("writes a custom status explicitly", () => {
		const calls: string[] = []
		const response = createResponse(createRawResponse(calls))

		response.status(404).send("not found")

		expect(calls).toEqual(["cork", "status:404 Not Found", "end"])
	})

	it("corks every streamed chunk", async () => {
		const calls: string[] = []
		const response = createResponse(createRawResponse(calls))

		await response._stream_chunk(Buffer.from("chunk"), 5)

		expect(calls).toEqual(["cork", "tryEnd"])
	})

	it("initializes cookie and drain state", () => {
		const calls: string[] = []
		const raw = createRawResponse(calls)
		const engine = { _resolve_pending_request() {} }
		const route = { engine }

		const response = Response.create(raw as any, route as any, {}, null)

		expect(response._cookies).toBeNull()
		expect(response._drain_handler).toBeNull()
		expect(() => response.cookie("x-test", "1")).not.toThrow()
	})
})
