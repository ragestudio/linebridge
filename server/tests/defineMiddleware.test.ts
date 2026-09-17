import { describe, it, expect } from "vitest"
import { defineMiddleware } from "../src/classes/Handler/middleware"
import { expectTypeOf } from "vitest"
import { Server } from "../src/index"
import composeMiddlewares from "../src/utils/composeMiddlewares"
import { EngineAdaptor } from "../src/classes/EngineAdaptor"

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
		class MockServer extends Server<any> {
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

		// 4. Instantiate and initialize the server
		const server = new MockServer()

		// Mock engine to intercept register_middleware
		const registeredMiddlewares: any[] = []
		class MockEngine extends EngineAdaptor {
			initialize = async () => {}
			listen = async () => {}
			close = async () => true
			register_middleware = (mw: any) => {
				// Replicate engine logic: extracting context from the server
				let ctx: any = undefined
				if (mw.useContexts) {
					ctx = {}
					mw.useContexts.forEach((key: string) => {
						if ((server.contexts as any)[key]) {
							ctx[key] = (server.contexts as any)[key]
						}
					})
				}
				registeredMiddlewares.push({ ...mw, ctx })
			}
		}

		server.engine = new MockEngine(server as any)

		// Replicate baseMiddlewares composer which is called in server run()
		const middlewares = composeMiddlewares({ testMw }, ["testMw"])

		middlewares.forEach((mw: any) => {
			server.engine.register_middleware(mw)
		})

		// 5. Check if the engine registered it with the context resolved
		expect(registeredMiddlewares).toHaveLength(1)
		const handler = registeredMiddlewares[0]
		expect(handler.ctx).toBeDefined()
		expect(handler.ctx.db).toBeDefined()
		expect(handler.ctx.db.value).toBe(42)

		// 6. Execute the handler to verify runtime propagation
		await handler.fn({} as any, {} as any, () => {}, handler.ctx)
		expect(capturedCtx).toEqual({ db: { value: 42 } })
	})
})
