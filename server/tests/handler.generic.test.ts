import { describe, it, expect, vi } from "vitest"
import { Handler, HandlerKind } from "../src/classes/Handler/index"
import { OperationError } from "../src/classes/OperationError"
import EngineAdaptor from "../src/classes/EngineAdaptor"
import Server from "../src/server"

class MockEngine extends EngineAdaptor {
	constructor() {
		super({} as Server)
	}
}

function createResponse() {
	const res = {
		completed: false,
		payload: undefined as unknown,
		failure: undefined as unknown,
		send: vi.fn((data: unknown) => {
			res.completed = true
			res.payload = data
		}),
		error: vi.fn((error: unknown, code?: number) => {
			res.completed = true
			res.failure = { error, code }
		}),
	}

	return res
}

describe("Handler generic", () => {
	const engine = new MockEngine()

	it("auto sends the returned value", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async () => ({ ok: true }),
		})

		const res = createResponse()

		await handler.execute({ data: {} }, res)

		expect(res.send).toHaveBeenCalledTimes(1)
		expect(res.send).toHaveBeenCalledWith({ ok: true })
	})

	it("sends null when the handler returns undefined", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async () => undefined,
		})

		const res = createResponse()

		await handler.execute({ data: {} }, res)

		expect(res.send).toHaveBeenCalledWith(null)
	})

	it("does not send twice when the handler responds explicitly", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async (_req, res: any) => {
				res.send("explicit")
				return "ignored"
			},
		})

		const res = createResponse()

		await handler.execute({ data: {} }, res)

		expect(res.send).toHaveBeenCalledTimes(1)
		expect(res.send).toHaveBeenCalledWith("explicit")
	})

	it("maps OperationError codes", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async () => {
				throw new OperationError(404, "not found")
			},
		})

		const res = createResponse()

		await handler.execute({ data: {} }, res)

		expect(res.error).toHaveBeenCalledTimes(1)
		expect(res.error.mock.calls[0][1]).toBe(404)
	})

	it("does not send when the response is already completed", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async () => "ignored",
		})

		const res = createResponse()
		res.completed = true

		await handler.execute({ data: {} }, res)

		expect(res.send).not.toHaveBeenCalled()
		expect(res.error).not.toHaveBeenCalled()
	})

	it("runs a generic middleware and advances with next", async () => {
		const next = vi.fn()

		const handler = new Handler<HandlerKind.middleware>({
			engine,
			kind: HandlerKind.middleware,
			fn: (_req, _res, advance) => advance(),
		})

		const res = createResponse()

		await handler.asGenericMiddleware({ data: {} }, res, next)

		expect(next).toHaveBeenCalledTimes(1)
		expect(res.send).not.toHaveBeenCalled()
	})

	it("passes the middleware contexts", async () => {
		const fn = vi.fn(() => undefined)

		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			ctx: { role: "admin" },
			fn,
		})

		const res = createResponse()

		await handler.asGenericMiddleware({ data: {} }, res, vi.fn())

		expect(fn).toHaveBeenCalledWith({ data: {} }, res, expect.any(Function), {
			role: "admin",
		})
	})

	it("maps generic middleware errors", async () => {
		const handler = new Handler<HandlerKind.generic>({
			engine,
			kind: HandlerKind.generic,
			fn: async () => {
				throw new OperationError(403, "forbidden")
			},
		})

		const res = createResponse()

		await handler.asGenericMiddleware({ data: {} }, res, vi.fn())

		expect(res.error).toHaveBeenCalledTimes(1)
		expect(res.error.mock.calls[0][1]).toBe(403)
	})
})
