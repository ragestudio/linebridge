import { describe, it, expect } from "vitest"
import { defineMiddleware } from "../src/classes/Handler/middleware"
import { expectTypeOf } from "vitest"

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

	it("should correctly infer extended request and response parameters", () => {
		// Define a middleware that injects 'user' into the request
		// and a 'customSend' function into the response
		type ReqExt = { user: { id: string; role: string } }
		type ResExt = { customSend: (data: string) => void }

		const define = defineMiddleware<ReqExt, ResExt>()

		const mw = define((req, res, next) => {
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
})
