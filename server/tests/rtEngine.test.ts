import type { RtEngineConfig } from "../src/classes/RtEngine/types"
import type Clients from "../src/classes/RtEngine/classes/clients"

import { describe, it, expect, vi, beforeEach, expectTypeOf } from "vitest"
import RTEngine from "../src/classes/RtEngine/index"
import Server from "../src/server"
import { HandlerKind, Handler } from "../src/classes/Handler"
import EngineAdaptor from "../src/classes/EngineAdaptor"

class MockEngine extends EngineAdaptor {
	constructor(server: Server) {
		super(server)
	}
}

describe("RTEngine", () => {
	let server: Server

	beforeEach(() => {
		// Mock console.error
		vi.spyOn(console, "error").mockImplementation(() => {})
		// Create a server with mocked engine
		server = new Server()
		server.engine = new MockEngine(server) as any
	})

	describe("Initialization", () => {
		it("should initialize with default config and built-in events", () => {
			const rtEngine = new RTEngine(server)

			expect(rtEngine.server).toBe(server)
			expect(rtEngine.config).toEqual({})
			expect(rtEngine.events.size).toBeGreaterThan(0) // At least 'ping' built-in should be there

			// Built-in event should be wrapped in Handler
			const pingHandler = rtEngine.events.get("ping")
			expect(pingHandler).toBeInstanceOf(Handler)
			expect(pingHandler?.kind).toBe(HandlerKind.ws)
		})

		it("should register user-defined events from config", () => {
			const myEventFn = async () => {}

			const rtEngine = new RTEngine(server, {
				events: {
					customEvent: myEventFn as any,
				},
			})

			const customHandler = rtEngine.events.get("customEvent")
			expect(customHandler).toBeDefined()
			expect(customHandler).toBeInstanceOf(Handler)
			expect(customHandler?.fn).toBe(myEventFn)
		})

		it("should store lifecycle hooks from config", () => {
			const onUpgrade = vi.fn()
			const onConnection = vi.fn()
			const onDisconnect = vi.fn()

			const rtEngine = new RTEngine(server, {
				onUpgrade,
				onConnection,
				onDisconnect,
			})

			expect(rtEngine.onUpgrade).toBe(onUpgrade)
			expect(rtEngine.onConnection).toBe(onConnection)
			expect(rtEngine.onDisconnect).toBe(onDisconnect)
		})
	})

	describe("registerEvent", () => {
		it("should wrap a plain function in a Handler", () => {
			const rtEngine = new RTEngine(server)
			const handlerFn = async () => {}

			rtEngine.registerEvent("testEvent", handlerFn)

			const handler = rtEngine.events.get("testEvent")
			expect(handler).toBeInstanceOf(Handler)
			expect(handler?.fn).toBe(handlerFn)
		})

		it("should wrap an object with fn in a Handler", () => {
			const rtEngine = new RTEngine(server)
			const handlerFn = async () => {}

			rtEngine.registerEvent("testEventObj", { fn: handlerFn })

			const handler = rtEngine.events.get("testEventObj")
			expect(handler).toBeInstanceOf(Handler)
			expect(handler?.fn).toBe(handlerFn)
		})

		it("should not register if fn is missing and log an error", () => {
			const rtEngine = new RTEngine(server)
			rtEngine.registerEvent("invalidEvent", { notFn: "hello" })

			expect(rtEngine.events.has("invalidEvent")).toBe(false)
			expect(console.error).toHaveBeenCalledWith(
				"Event handler must have a function",
			)
		})

		it("should resolve contexts if useContexts is provided", () => {
			server.contexts = { db: { connected: true } }
			const rtEngine = new RTEngine(server)

			const handlerFn = async () => {}
			rtEngine.registerEvent("ctxEvent", {
				fn: handlerFn,
				useContexts: ["db"],
			})

			const handler = rtEngine.events.get("ctxEvent")
			expect(handler?.ctx).toHaveProperty("db")
			expect(handler?.ctx?.db).toEqual({ connected: true })
		})
	})

	describe("registerEvents", () => {
		it("should register multiple events from an object", () => {
			const rtEngine = new RTEngine(server)

			const fn1 = async () => {}
			const fn2 = async () => {}

			rtEngine.registerEvents({
				eventOne: fn1,
				eventTwo: { fn: fn2 },
			})

			expect(rtEngine.events.has("eventOne")).toBe(true)
			expect(rtEngine.events.has("eventTwo")).toBe(true)
			expect(rtEngine.events.get("eventOne")?.fn).toBe(fn1)
			expect(rtEngine.events.get("eventTwo")?.fn).toBe(fn2)
		})
	})

	describe("encode / decode", () => {
		it("should encode object to JSON string", () => {
			const rtEngine = new RTEngine(server)
			const data = { hello: "world" }
			const result = rtEngine.encode(data)
			expect(result).toBe('{"hello":"world"}')
		})

		it("should decode JSON string to object", () => {
			const rtEngine = new RTEngine(server)
			const jsonStr = '{"hello":"world"}'
			const result = rtEngine.decode(jsonStr)
			expect(result).toEqual({ hello: "world" })
		})
	})
})

describe("RTEngine Type Inference", () => {
	it("should have correctly typed properties", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any
		const rtEngine = new RTEngine(server)

		// Check basic properties
		expectTypeOf(rtEngine.config).toEqualTypeOf<RtEngineConfig>()
		expectTypeOf(rtEngine.clients).toEqualTypeOf<Clients>()
		expectTypeOf(rtEngine.events).toEqualTypeOf<Map<string, Handler>>()

		// Check hooks signatures
		expectTypeOf(rtEngine.onUpgrade).toMatchTypeOf<
			RtEngineConfig["onUpgrade"]
		>()
		expectTypeOf(rtEngine.onConnection).toMatchTypeOf<
			RtEngineConfig["onConnection"]
		>()
		expectTypeOf(rtEngine.onDisconnect).toMatchTypeOf<
			RtEngineConfig["onDisconnect"]
		>()

		// Check encode/decode signatures
		expectTypeOf(rtEngine.encode).toEqualTypeOf<(data: any) => string>()
		expectTypeOf(rtEngine.decode).toEqualTypeOf<(data: any) => any>()
	})

	it("should have strict sender and finder bindings", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any
		const rtEngine = new RTEngine(server)

		// Check the bound functions inside find and senders objects
		expectTypeOf(rtEngine.find.clientsByUserId).toBeFunction()
		expectTypeOf(rtEngine.senders.toTopic).toBeFunction()
		expectTypeOf(rtEngine.senders.toClientId).toBeFunction()
		expectTypeOf(rtEngine.senders.toUserId).toBeFunction()
	})
})
