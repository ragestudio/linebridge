import { describe, it, expect, vi, beforeEach } from "vitest"
import { connect } from "@nats-io/transport-node"
import { Server } from "linebridge/server"
import { registerEngine } from "linebridge/engines"
import { defineRoute } from "linebridge/classes/Route/index"

import "../src/index"
import { NatsEngine } from "../src/engine"

vi.mock("@nats-io/transport-node", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@nats-io/transport-node")>()

	return {
		...actual,
		connect: vi.fn(),
	}
})

const encoder = new TextEncoder()

describe("Server with NatsEngine", () => {
	let connection: any
	let subscription: any

	beforeEach(() => {
		subscription = { unsubscribe: vi.fn() }

		connection = {
			subscribe: vi.fn().mockReturnValue(subscription),
			publish: vi.fn(),
			request: vi.fn(),
			drain: vi.fn().mockResolvedValue(undefined),
		}
		;(connect as any).mockResolvedValue(connection)

		vi.spyOn(console, "info").mockImplementation(() => {})
		vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	it("registers class routes as NATS subscriptions", async () => {
		registerEngine("nats", NatsEngine)

		class TestServer extends Server<"nats"> {
			static useEngine = "nats"
			static baseRoutes = false
			static websockets = false

			routes = {
				ping: defineRoute<TestServer, "generic">()({
					kind: "generic",
					path: "test.ping",
					fn: async () => "pong",
				}),
			}
		}

		const server = new TestServer({
			refName: "test-server",
			nats: { address: "127.0.0.1", port: 4222 },
		})

		await server.run()

		expect(connection.subscribe).toHaveBeenCalledWith(
			"test.ping",
			expect.objectContaining({ callback: expect.any(Function) }),
		)

		const callback = connection.subscribe.mock.calls[0][1].callback
		const message = {
			subject: "test.ping",
			reply: "inbox",
			headers: undefined,
			data: encoder.encode("{}"),
			respond: vi.fn(),
		}

		callback(null, message)

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(message.respond).toHaveBeenCalledTimes(1)

		const payload = JSON.parse(
			new TextDecoder().decode(message.respond.mock.calls[0][0]),
		)

		expect(payload).toEqual({ data: "pong" })

		await server._fireClose()
	})
})
