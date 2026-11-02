import { describe, it, expect, expectTypeOf } from "vitest"
import { defineRoute } from "../src/classes/Route/index"
import Server from "../src/server"

describe("defineRoute", () => {
	it("should return a definition function when called", () => {
		const define = defineRoute()
		expect(typeof define).toBe("function")
	})

	it("the returned define function should return the exact route object provided", () => {
		const define = defineRoute()

		const mockFn = async () => {}
		const routeDefinition = {
			method: "post" as const,
			useMiddlewares: ["logs"] as const,
			useContexts: ["server"] as const,
			fn: mockFn,
		}

		const result = define(routeDefinition)

		expect(result).toBe(routeDefinition) // Should be the exact same reference
		expect(result.method).toBe("post")
		expect(result.useMiddlewares).toEqual(["logs"])
		expect(result.useContexts).toEqual(["server"])
		expect(result.fn).toBe(mockFn)
	})

	it("should work with minimal route definitions", () => {
		const define = defineRoute()

		const mockFn = async () => {}
		const routeDefinition = {
			fn: mockFn,
		}

		const result = define(routeDefinition)

		expect(result).toBe(routeDefinition)
		expect(result.fn).toBe(mockFn)
		expect(result.method).toBeUndefined()
	})
})

describe("defineRoute generic", () => {
	class CustomServer extends Server {
		declare contexts: {
			server: Server
			db: { connect: () => boolean }
		}
	}

	it("accepts a path and contexts without an http method", () => {
		const define = defineRoute<CustomServer, "generic">()

		const fn = async () => true
		const route = define({
			kind: "generic",
			path: "sfu.ping",
			useContexts: ["db"] as const,
			fn,
		})

		expect(route.kind).toBe("generic")
		expect(route.path).toBe("sfu.ping")
		expect(route.useContexts).toEqual(["db"])
		expect(route.fn).toBe(fn)
	})

	it("rejects the http method on generic routes", () => {
		const define = defineRoute<CustomServer, "generic">()

		define({
			kind: "generic",
			path: "sfu.ping",
			// @ts-expect-error method is http specific
			method: "get",
			fn: async () => true,
		})
	})

	it("allows omitting the kind on generic routes", () => {
		const define = defineRoute<CustomServer, "generic">()

		const route = define({
			path: "sfu.ping",
			fn: async () => true,
		})

		expect(route.kind).toBeUndefined()
	})

	it("allows omitting the kind on ws routes", () => {
		const define = defineRoute<CustomServer, "ws">()

		const route = define({
			fn: async () => true,
		})

		expect(route.kind).toBeUndefined()
	})
})

describe("defineRoute Type Inference", () => {
	// Custom server mock for type tests
	class CustomServer extends Server {
		declare contexts: {
			server: Server
			db: { connect: () => boolean }
		}
		declare middlewares: {
			logs: any
			cors: any
			customMw: any
		}
	}

	it("should correctly infer parameters using expectTypeOf", () => {
		const define = defineRoute<CustomServer>()

		define({
			method: "get",
			useMiddlewares: ["logs"] as const,
			useContexts: ["db"] as const,
			fn: (req, res, ctx) => {
				// Static type assertions
				expectTypeOf(req.method).toBeString()
				expectTypeOf(res.json).toBeFunction()

				// Assert that ctx contains exactly the 'db' property and nothing else from contexts
				expectTypeOf(ctx).toEqualTypeOf<{
					db: { connect: () => boolean }
				}>()

				// Assert that ctx does NOT contain 'server' (because it wasn't specified in useContexts)
				expectTypeOf(ctx).not.toHaveProperty("server")
			},
		})
	})
})
