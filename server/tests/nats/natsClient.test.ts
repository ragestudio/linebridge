import { describe, it, expect, vi, beforeEach } from "vitest"
import NatsClient from "../../src/classes/Nats/client"

vi.mock("../../src/classes/Nats/serializers", () => ({
	EventData: vi.fn((data) => JSON.stringify(data)),
	Operation: vi.fn((data) => JSON.stringify(data)),
}))

describe("NatsClient", () => {
	let mockEngine: any
	let mockNats: any
	let mockHeaders: any
	let mockCodec: any

	beforeEach(() => {
		mockEngine = {
			topics: ["topic1", "topic2"],
		}

		mockNats = {
			publish: vi.fn(),
			request: vi.fn(),
		}

		const headersMap = new Map([
			["socket_id", "s123"],
			["token", "t123"],
			["user_id", "u123"],
			["username", "testuser"],
			["user", '{"_id":"u123","username":"testuser","role":"admin"}'],
		])

		mockHeaders = {
			get: vi.fn((key) => headersMap.get(key) || null),
		}

		mockCodec = {
			encode: vi.fn((data) => Buffer.from(JSON.stringify(data))),
			decode: vi.fn((data) => JSON.parse(data.toString())),
		}

		vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	describe("Initialization and Getters", () => {
		it("should extract context from headers upon initialization", () => {
			const client = new NatsClient({
				engine: mockEngine,
				nats: mockNats,
				headers: mockHeaders,
				codec: mockCodec,
			})

			expect(client.id).toBe("s123")
			expect(client.userId).toBe("u123")
			expect(client.authenticated).toBe(true)
			expect(client.user).toEqual({
				_id: "u123",
				username: "testuser",
				role: "admin",
			})
		})

		it("should construct a partial user if full user header is missing", () => {
			mockHeaders.get.mockImplementation((key: string) => {
				if (key === "user") return null
				if (key === "user_id") return "u456"
				if (key === "username") return "minuser"
				return null
			})

			const client = new NatsClient({
				engine: mockEngine,
				nats: mockNats,
				headers: mockHeaders,
				codec: mockCodec,
			})

			expect(client.user).toEqual({
				_id: "u456",
				username: "minuser",
				avatar: undefined,
			})
		})
	})

	describe("Messaging and Operations", () => {
		let client: NatsClient

		beforeEach(() => {
			client = new NatsClient({
				engine: mockEngine,
				nats: mockNats,
				headers: mockHeaders,
				codec: mockCodec,
			})
		})

		it("should publish events via ipc subject", async () => {
			await client.emit("testEvent", { foo: "bar" }, null, true)

			expect(mockNats.publish).toHaveBeenCalledWith(
				"ipc",
				expect.any(Buffer),
				{ headers: mockHeaders },
			)
			// Ensure it serialized properly by inspecting buffer if needed
		})

		it("should send error explicitly", async () => {
			vi.spyOn(client, "emit").mockResolvedValue()
			await client.error("test error")

			expect(client.emit).toHaveBeenCalledWith(
				"error",
				null,
				"test error",
				false,
			)
		})

		it("should send ack explicitly", async () => {
			vi.spyOn(client, "emit").mockResolvedValue()
			await client.ack("testEvent", { success: true })

			expect(client.emit).toHaveBeenCalledWith(
				"testEvent",
				{ success: true },
				undefined,
				true,
			)
		})

		it("should execute an operation over NATS request", async () => {
			mockNats.request.mockResolvedValue({
				data: Buffer.from(
					JSON.stringify({ ok: true, result: "success" }),
				),
			})

			const result = await client.operation("testOp", { data: 1 })

			expect(mockNats.request).toHaveBeenCalledWith(
				"operations",
				expect.any(Buffer),
				expect.objectContaining({
					headers: mockHeaders,
					timeout: 50000,
				}),
			)
			expect(result).toEqual({ ok: true, result: "success" })
		})

		it("should return null if operation throws", async () => {
			mockNats.request.mockRejectedValue(new Error("Timeout"))

			const result = await client.operation("testOp")

			expect(result).toBeNull()
			expect(console.error).toHaveBeenCalled()
		})
	})

	describe("Pub/Sub", () => {
		let client: NatsClient

		beforeEach(() => {
			client = new NatsClient({
				engine: mockEngine,
				nats: mockNats,
				headers: mockHeaders,
				codec: mockCodec,
			})
			vi.spyOn(client, "emit").mockResolvedValue()
			vi.spyOn(client, "error").mockResolvedValue()
		})

		it("should subscribe to a topic", async () => {
			vi.spyOn(client, "operation").mockResolvedValue({ ok: true })
			await client.subscribe("news")

			expect(client.operation).toHaveBeenCalledWith("subscribeToTopic", {
				topic: "news",
			})
			expect(client.emit).toHaveBeenCalledWith("topic:subscribed", "news")
		})

		it("should send error if subscribe fails", async () => {
			vi.spyOn(client, "operation").mockResolvedValue({
				ok: false,
				error: "not allowed",
			})
			await client.subscribe("news")

			expect(client.error).toHaveBeenCalledWith("not allowed")
			expect(client.emit).not.toHaveBeenCalledWith(
				"topic:subscribed",
				"news",
			)
		})

		it("should unsubscribe from a topic", async () => {
			vi.spyOn(client, "operation").mockResolvedValue({ ok: true })
			await client.unsubscribe("news")

			expect(client.operation).toHaveBeenCalledWith(
				"unsubscribeToTopic",
				{ topic: "news" },
			)
			expect(client.emit).toHaveBeenCalledWith(
				"topic:unsubscribed",
				"news",
			)
		})

		it("should send to topic without self", async () => {
			vi.spyOn(client, "operation").mockResolvedValue({ ok: true })
			await client.toTopic("news", "headline", { text: "hello" }, false)

			expect(client.operation).toHaveBeenCalledWith("sendToTopic", {
				topic: "news",
				event: "headline",
				data: { text: "hello" },
			})
			expect(client.emit).not.toHaveBeenCalledWith("headline", {
				text: "hello",
			})
		})

		it("should send to topic with self", async () => {
			vi.spyOn(client, "operation").mockResolvedValue({ ok: true })
			await client.toTopic("news", "headline", { text: "hello" }, true)

			expect(client.emit).toHaveBeenCalledWith("headline", {
				text: "hello",
			})
		})
	})
})
