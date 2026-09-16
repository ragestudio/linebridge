import { describe, it, expect } from "vitest"
import { defineMiddleware } from "../src/classes/Handler/middleware"
import { expectTypeOf } from "vitest"
import { Server } from "../src/index"
import composeMiddlewares from "../src/utils/composeMiddlewares"
import register_middleware from "../src/engines/neo/register_middleware"
import NeoEngine from "../src/engines/neo"

describe("defineMiddleware", () => {
	it("should return a definition function when called", () => {
		const define = defineMiddleware()
		expect(typeof define).toBe("function")
	})

	it("the returned define function should return the exact middleware function provided", () => {
		const define = defineMiddleware()

		const mockMw = (req: any, res: any, next: () => void) => {
			next()
		}

		const result = define(mockMw)

		// It should be the exact same function reference at runtime
		expect(result).toBe(mockMw)
	})
})

describe("defineMiddleware Type Inference", () => {
	it("should correctly infer parameters without extensions", () => {
		const define = defineMiddleware()

		define((req, res, next) => {
			expectTypeOf(req.method).toBeString()
			expectTypeOf(res.json).toBeFunction()
			expectTypeOf(next).toBeFunction()
		})
	})

	it("should correctly infer extended request and response parameters via simple signature", () => {
		type ReqExt = { user: { id: string; role: string } }
		type ResExt = { customSend: (data: string) => void }

		const define = defineMiddleware()

		const mw = define<ReqExt, ResExt>((req, res, next) => {
			// Base properties should exist
			expectTypeOf(req.method).toBeString()
			expectTypeOf(res.json).toBeFunction()

			// Extended properties should exist and be strongly typed
			expectTypeOf(req.user).toEqualTypeOf<{ id: string; role: string }>()
			expectTypeOf(res.customSend).toBeFunction()

			// Should not have random properties
			expectTypeOf(req).not.toHaveProperty("nonExistentProp")
		})

		// The resulting middleware should be correctly typed
		expectTypeOf(mw).toBeFunction()
	})

	it("should correctly infer extended parameters and contexts via object signature", () => {
		class MockServer extends Server<"neo"> {
			contexts = {
				db: { query: () => "mock" },
			}
		}

		const define = defineMiddleware<typeof MockServer>()

		const mw = define({
			useContexts: ["db"],
			injectReq: {} as { user: string },
			fn: (req, res, next, ctx) => {
				expectTypeOf(req.user).toBeString()
				expectTypeOf(ctx.db.query).toBeFunction()
			},
		})

		expectTypeOf(mw.fn).toBeFunction()
		expect(mw.useContexts).toContain("db")
	})
})

describe("defineMiddleware Runtime Execution", () => {
	it("should properly resolve and inject contexts into the middleware at runtime", async () => {
		// 1. Create a server with a context
		class MockServer extends Server<"neo"> {
			contexts = {
				db: { value: 42 },
			}
		}

		let capturedCtx: any = null

		// 2. Define a middleware requesting the context
		const testMw = defineMiddleware<typeof MockServer>()({
			useContexts: ["db"],
			fn: async (req, res, next, ctx) => {
				capturedCtx = ctx
				next()
			},
		})

		// 3. Inject it globally
		MockServer.useMiddlewares = [testMw]

		// 4. Instantiate and initialize the server to trigger composeMiddlewares & register_middleware
		const server = new MockServer()

		const mockEngine = new NeoEngine(server as any)
		mockEngine.register_middleware = function (mw: any) {
			// Replicate register_middleware logic
			register_middleware.call(this, mw)
		}
		server.engine = mockEngine

		// Replicate baseMiddlewares composer which is called in server run()
		const middlewares = composeMiddlewares({ testMw }, ["testMw"])

		middlewares.forEach((mw: any) => {
			mockEngine.register_middleware(mw)
		})

		// 5. Check if the engine registered it as a Handler with the context resolved
		expect(mockEngine.middlewares).toHaveLength(1)
		const handler = mockEngine.middlewares[0]
		expect(handler.ctx).toBeDefined()
		expect(handler.ctx!.db).toBeDefined()
		expect(handler.ctx!.db.value).toBe(42)

		// 6. Execute the handler to verify runtime propagation
		await handler.executeAsMiddleware({} as any, {} as any, () => {})
		expect(capturedCtx).toEqual({ db: { value: 42 } })
	})
})
