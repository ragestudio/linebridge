import { describe, it, expect, vi, beforeEach } from "vitest"
import { Handler, HandlerKind } from "../src/classes/Handler/index"
import { OperationError } from "../src/classes/OperationError"
import Server from "../src/server"
import EngineAdaptor from "../src/classes/EngineAdaptor"

class MockEngine extends EngineAdaptor {
	constructor() {
		super({} as Server) // Pass a dummy server reference
	}
}

describe("Handler Class", () => {
	let engine: MockEngine

	beforeEach(() => {
		engine = new MockEngine()
		vi.spyOn(console, "error").mockImplementation(() => {}) // Suppress expected error logs
		vi.spyOn(console, "debug").mockImplementation(() => {}) // Suppress expected debug logs
	})

	describe("Initialization", () => {
		it("should throw if engine is missing or invalid", () => {
			expect(() => {
				new Handler({ kind: HandlerKind.http, fn: () => {} } as any)
			}).toThrow("Missing Handler engine")
		})

		it("should throw if kind is missing or invalid", () => {
			expect(() => {
				new Handler({ engine, kind: "unknown", fn: () => {} } as any)
			}).toThrow("Missing or Invalid Handler kind")
		})

		it("should throw if fn is missing or invalid", () => {
			expect(() => {
				new Handler({ engine, kind: HandlerKind.http, fn: null } as any)
			}).toThrow("Missing or Invalid Handler function")
		})

		it("should initialize successfully with valid parameters", () => {
			const fn = vi.fn()
			const handler = new Handler({
				engine,
				kind: HandlerKind.http,
				fn,
				ctx: { foo: "bar" },
			})
			expect(handler.kind).toBe(HandlerKind.http)
			expect(handler.engine).toBe(engine)
			expect(handler.fn).toBe(fn)
			expect(handler.ctx).toEqual({ foo: "bar" })
		})
	})

	describe("HTTP Execution", () => {
		const createMockRes = () => {
			const res: any = {
				completed: false,
				_statusCode: 200,
				status: vi.fn().mockImplementation((code) => {
					res._statusCode = code
					return res
				}),
				json: vi.fn().mockImplementation(() => {
					res.completed = true
				}),
			}
			return res
		}

		it("should auto-json stringify returned data if not completed", async () => {
			const handler = new Handler<HandlerKind.http>({
				engine,
				kind: HandlerKind.http,
				fn: async (req, res) => {
					return { hello: "world" }
				},
			})

			const req: any = {}
			const res = createMockRes()

			await handler.execute(req, res)

			expect(res.json).toHaveBeenCalledWith({ hello: "world" })
			expect(res.completed).toBe(true)
		})

		it("should not auto-json if res.completed is true", async () => {
			const handler = new Handler<HandlerKind.http>({
				engine,
				kind: HandlerKind.http,
				fn: async (req, res) => {
					res.completed = true
					return { ignored: "data" }
				},
			})

			const req: any = {}
			const res = createMockRes()

			await handler.execute(req, res)
			expect(res.json).not.toHaveBeenCalled()
		})

		it("should catch OperationError and format as appropriate JSON response", async () => {
			const handler = new Handler<HandlerKind.http>({
				engine,
				kind: HandlerKind.http,
				fn: async () => {
					throw new OperationError(404, "User not found")
				},
			})

			const res = createMockRes()
			await handler.execute({}, res)

			expect(res.status).toHaveBeenCalledWith(404)
			expect(res.json).toHaveBeenCalledWith({ error: "User not found" })
		})

		it("should catch generic Error and return 500 JSON response", async () => {
			const handler = new Handler<HandlerKind.http>({
				engine,
				kind: HandlerKind.http,
				fn: async () => {
					throw new Error("Critical database failure")
				},
			})

			const res = createMockRes()
			await handler.execute({}, res)

			expect(res.status).toHaveBeenCalledWith(500)
			expect(res.json).toHaveBeenCalledWith({
				error: "Critical database failure",
			})
			// Console error should have been triggered
			expect(console.error).toHaveBeenCalled()
		})
	})

	describe("Middleware Execution", () => {
		const createMockRes = () => {
			const res: any = {
				status: vi.fn().mockReturnThis(),
				json: vi.fn(),
			}
			return res
		}

		it("should call next() successfully", async () => {
			const next = vi.fn()
			const handler = new Handler<HandlerKind.middleware>({
				engine,
				kind: HandlerKind.middleware,
				fn: async (req, res, nextFn) => {
					nextFn()
				},
			})

			await handler.execute({}, createMockRes(), next)
			expect(next).toHaveBeenCalled()
		})

		it("should catch OperationError in middleware and halt with status response", async () => {
			const next = vi.fn()
			const handler = new Handler<HandlerKind.middleware>({
				engine,
				kind: HandlerKind.middleware,
				fn: async () => {
					throw new OperationError(401, "Unauthorized")
				},
			})

			const res = createMockRes()
			await handler.execute({}, res, next)

			expect(res.status).toHaveBeenCalledWith(401)
			expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" })
			expect(next).not.toHaveBeenCalled()
		})
	})

	describe("WebSocket Execution", () => {
		it("should execute websocket handler and return [result, null]", async () => {
			const handler = new Handler<HandlerKind.ws>({
				engine,
				kind: HandlerKind.ws,
				fn: async (client, data, ctx) => {
					return { processed: true }
				},
			})

			const result = (await handler.execute({} as any, {
				msg: "hello",
			})) as [any, any]
			expect(result).toEqual([{ processed: true }, null])
		})

		it("should catch websocket error and return [null, error]", async () => {
			const wsError = new Error("WS failure")
			const handler = new Handler<HandlerKind.ws>({
				engine,
				kind: HandlerKind.ws,
				fn: async () => {
					throw wsError
				},
			})

			const result = (await handler.execute({} as any, {})) as [any, any]

			// result[0] is data (null), result[1] is error
			expect(result[0]).toBeNull()
			expect(result[1]).toBe(wsError)
			expect(console.debug).toHaveBeenCalled()
		})
	})
})
