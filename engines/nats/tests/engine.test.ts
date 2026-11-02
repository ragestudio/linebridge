import { describe, it, expect, vi, beforeEach } from "vitest"
import { HandlerKind } from "linebridge/classes/Handler/index"
import { connect } from "@nats-io/transport-node"

import { NatsEngine, NatsRpcError } from "../src/engine"
import { NatsResponse } from "../src/response"
import { defineNatsRoute } from "../src/route"

vi.mock("@nats-io/transport-node", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@nats-io/transport-node")>()

	return {
		...actual,
		connect: vi.fn(),
	}
})

const encoder = new TextEncoder()

function createMessage(data: unknown, reply = "inbox") {
	return {
		subject: "sfu.ping",
		reply,
		headers: undefined,
		data: encoder.encode(JSON.stringify(data)),
		respond: vi.fn(),
	}
}

describe("NatsEngine", () => {
	let server: any
	let connection: any
	let subscription: any
	let engine: NatsEngine

	beforeEach(() => {
		subscription = { unsubscribe: vi.fn() }

		connection = {
			subscribe: vi.fn().mockReturnValue(subscription),
			publish: vi.fn(),
			request: vi.fn(),
			drain: vi.fn().mockResolvedValue(undefined),
		}
		;(connect as any).mockResolvedValue(connection)

		server = {
			params: {
				refName: "test",
				nats: { address: "127.0.0.1", port: 4222 },
			},
			_fireClose: vi.fn().mockResolvedValue(undefined),
		}

		engine = new NatsEngine(server)
	})

	it("connects using params.nats", async () => {
		await engine.initialize()

		expect(connect).toHaveBeenCalledWith(
			expect.objectContaining({
				servers: "nats://127.0.0.1:4222",
			}),
		)
		expect(engine.connection).toBe(connection)
	})

	it("subscribes generic routes and dispatches messages", async () => {
		await engine.initialize()

		const route = {
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: { value: 42 },
			handler: { asGeneric: vi.fn().mockResolvedValue(undefined) },
		} as any

		engine.register(route)

		expect(connection.subscribe).toHaveBeenCalledWith(
			"sfu.ping",
			expect.objectContaining({ callback: expect.any(Function) }),
		)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = createMessage({ hello: "world" })

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(route.handler.asGeneric).toHaveBeenCalledTimes(1)

		const [req, res, ctx] = route.handler.asGeneric.mock.calls[0]

		expect(req.data).toEqual({ hello: "world" })
		expect(req.subject).toBe("sfu.ping")
		expect(res).toBeInstanceOf(NatsResponse)
		expect(ctx).toEqual({ value: 42 })
	})

	it("runs the handler for fire and forget messages", async () => {
		await engine.initialize()

		const handler = { asGeneric: vi.fn().mockResolvedValue(undefined) }

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: {},
			handler,
		} as any)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = createMessage({ hello: "world" }, "")

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(handler.asGeneric).toHaveBeenCalledTimes(1)
		expect(message.respond).not.toHaveBeenCalled()
	})

	it("runs middlewares for fire and forget messages when next is called", async () => {
		await engine.initialize()

		const middleware = {
			asGenericMiddleware: vi.fn((_req, _res, next) => next()),
		}
		const handler = { asGeneric: vi.fn().mockResolvedValue(undefined) }

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: {},
			middlewares: [middleware],
			handler,
		} as any)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = createMessage({}, "")

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(middleware.asGenericMiddleware).toHaveBeenCalledTimes(1)
		expect(handler.asGeneric).toHaveBeenCalledTimes(1)
		expect(message.respond).not.toHaveBeenCalled()
	})

	it("runs middlewares in order before the handler", async () => {
		await engine.initialize()

		const order: string[] = []

		const middleware = (name: string) => ({
			asGenericMiddleware: vi.fn(async (_req, _res, next) => {
				order.push(name)
				next()
			}),
		})

		const handler = {
			asGeneric: vi.fn(async () => {
				order.push("handler")
			}),
		}

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: {},
			middlewares: [middleware("first"), middleware("second")],
			handler,
		} as any)

		const callback = connection.subscribe.mock.calls[0][1].callback

		callback(null, createMessage({}))

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(order).toEqual(["first", "second", "handler"])
	})

	it("stops the chain when a middleware responds", async () => {
		await engine.initialize()

		const handler = { asGeneric: vi.fn() }

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: {},
			middlewares: [
				{
					asGenericMiddleware: vi.fn((_req, res) => {
						res.error(new Error("denied"), 403)
					}),
				},
			],
			handler,
		} as any)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = createMessage({})

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(handler.asGeneric).not.toHaveBeenCalled()
		expect(message.respond).toHaveBeenCalledTimes(1)

		const payload = JSON.parse(
			new TextDecoder().decode(message.respond.mock.calls[0][0]),
		)

		expect(payload).toEqual({ error: "denied", code: 403 })
	})

	it("stops the chain when a middleware does not call next", async () => {
		await engine.initialize()

		const handler = { asGeneric: vi.fn() }

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			ctx: {},
			middlewares: [{ asGenericMiddleware: vi.fn(() => undefined) }],
			handler,
		} as any)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = createMessage({})

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(handler.asGeneric).not.toHaveBeenCalled()
		expect(message.respond).not.toHaveBeenCalled()
	})

	it("rejects non generic routes", async () => {
		await engine.initialize()

		expect(() =>
			engine.register({
				kind: HandlerKind.http,
				path: "sfu.ping",
				handler: {},
			} as any),
		).toThrow("only supports generic routes")
	})

	it("rejects duplicated subjects", async () => {
		await engine.initialize()

		const route = {
			kind: HandlerKind.generic,
			path: "sfu.ping",
			handler: { asGeneric: vi.fn() },
		} as any

		engine.register(route)

		expect(() => engine.register(route)).toThrow("Duplicate NATS route")
	})

	it("uses the route queue group", async () => {
		await engine.initialize()

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.work",
			queue: "workers",
			handler: { asGeneric: vi.fn() },
		} as any)

		expect(connection.subscribe).toHaveBeenCalledWith(
			"sfu.work",
			expect.objectContaining({ queue: "workers" }),
		)
	})

	it("throws NatsRpcError with the remote code", async () => {
		await engine.initialize()

		connection.request.mockResolvedValue({
			data: encoder.encode(JSON.stringify({ error: "missing", code: 409 })),
		})

		await expect(engine.request("sfu.ping", {})).rejects.toBeInstanceOf(
			NatsRpcError,
		)

		try {
			await engine.request("sfu.ping", {})
		} catch (error) {
			expect(error).toMatchObject({ message: "missing", code: 409 })
		}
	})

	it("publishes encoded payloads", async () => {
		await engine.initialize()

		engine.publish("sfu.events", { event: "ping" })

		expect(connection.publish).toHaveBeenCalledWith(
			"sfu.events",
			expect.any(Uint8Array),
		)
	})

	it("unsubscribes and drains on close", async () => {
		await engine.initialize()

		engine.register({
			kind: HandlerKind.generic,
			path: "sfu.ping",
			handler: { asGeneric: vi.fn() },
		} as any)

		await engine.close()

		expect(subscription.unsubscribe).toHaveBeenCalled()
		expect(connection.drain).toHaveBeenCalled()
	})
})

describe("NatsResponse", () => {
	const codec = {
		encode: (data: unknown) => encoder.encode(JSON.stringify(data)),
		decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
	}

	it("responds with the data envelope", () => {
		const msg = createMessage(null)

		const res = new NatsResponse(msg as any, codec as any)

		res.send({ ok: true })

		expect(msg.respond).toHaveBeenCalledTimes(1)

		const payload = JSON.parse(
			new TextDecoder().decode(msg.respond.mock.calls[0][0]),
		)

		expect(payload).toEqual({ data: { ok: true } })
	})

	it("responds with the error envelope", () => {
		const msg = createMessage(null)

		const res = new NatsResponse(msg as any, codec as any)

		res.error(new Error("boom"), 409)

		const payload = JSON.parse(
			new TextDecoder().decode(msg.respond.mock.calls[0][0]),
		)

		expect(payload).toEqual({ error: "boom", code: 409 })
	})

	it("does not respond to fire and forget messages", () => {
		const msg = createMessage(null, "")

		const res = new NatsResponse(msg as any, codec as any)

		res.send({ ok: true })

		expect(res.completed).toBe(true)
		expect(res.handled).toBe(true)
		expect(msg.respond).not.toHaveBeenCalled()
	})
})

describe("defineNatsRoute", () => {
	it("creates a generic route that exposes the payload", async () => {
		const fn = vi.fn().mockResolvedValue("pong")

		const route = defineNatsRoute<any, { ping: string }, string>({
			path: "sfu.ping",
			fn,
		})

		expect(route.kind).toBe(HandlerKind.generic)
		expect(route.path).toBe("sfu.ping")

		const result = await (route.fn as any)({ data: { ping: "hello" } }, {}, {})

		expect(fn).toHaveBeenCalledWith({ ping: "hello" }, {})
		expect(result).toBe("pong")
	})
})
