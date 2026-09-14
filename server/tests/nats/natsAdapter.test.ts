import { describe, it, expect, vi, beforeEach } from "vitest"
import NatsAdapter from "../../src/classes/Nats/adapter"
import Server from "../../src/server"

import * as nats from "@nats-io/transport-node"
import { jetstream, jetstreamManager } from "@nats-io/jetstream"

// Mock nats packages
vi.mock("@nats-io/transport-node", () => ({
	connect: vi.fn(),
	headers: vi.fn(),
}))

vi.mock("@nats-io/jetstream", () => ({
	jetstream: vi.fn(),
	jetstreamManager: vi.fn(),
}))

describe("NatsAdapter", () => {
	let server: any
	let mockConnection: any
	let mockJetstream: any
	let mockJsm: any

	beforeEach(() => {
		server = new Server()
		;(server.constructor as any).refName = "test-service"

		mockConnection = {
			getServer: vi.fn().mockReturnValue("localhost:4222"),
			subscribe: vi.fn(),
		}

		mockJetstream = {
			consumers: {
				get: vi.fn(),
			},
		}

		mockJsm = {
			streams: {
				find: vi.fn(),
				add: vi.fn(),
			},
			consumers: {
				add: vi.fn(),
			},
		}
		;(nats.connect as any).mockResolvedValue(mockConnection)
		;(jetstream as any).mockReturnValue(mockJetstream)
		;(jetstreamManager as any).mockResolvedValue(mockJsm)

		vi.spyOn(console, "log").mockImplementation(() => {})
		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	describe("Initialization", () => {
		it("should connect to nats and set up jetstream", async () => {
			const adapter = new NatsAdapter(server, {
				address: "127.0.0.1",
				port: 4222,
			})

			mockJsm.streams.find.mockResolvedValue("IPC")
			mockJetstream.consumers.get.mockResolvedValue({
				consume: vi.fn().mockReturnValue([]), // Empty iterable
			})

			await adapter.initialize()

			expect(nats.connect).toHaveBeenCalledWith({
				servers: "nats://127.0.0.1:4222",
			})
			expect(jetstream).toHaveBeenCalledWith(mockConnection)
			expect(jetstreamManager).toHaveBeenCalledWith(mockConnection)

			// Verify it checks/adds consumers
			expect(mockJsm.consumers.add).toHaveBeenCalledWith("IPC", {
				durable_name: "test-service-processor",
				filter_subject: "ipc.test-service",
				ack_policy: "explicit",
			})
		})

		it("should create the stream if it does not exist", async () => {
			const adapter = new NatsAdapter(server)

			mockJsm.streams.find.mockRejectedValue(new Error("not found"))
			mockJetstream.consumers.get.mockResolvedValue({
				consume: vi.fn().mockReturnValue([]),
			})

			await adapter.initialize()

			expect(mockJsm.streams.add).toHaveBeenCalledWith({
				name: "IPC",
				subjects: ["ipc.>"],
			})
		})
	})

	describe("Global PubSub", () => {
		it("should subscribe to global channel and track the subscription", async () => {
			const adapter = new NatsAdapter(server)
			adapter.connection = mockConnection

			const mockSub = {
				drain: vi.fn(),
			}
			;(mockSub as any)[Symbol.asyncIterator] = async function* () {}

			mockConnection.subscribe.mockReturnValue(mockSub)

			const handler = vi.fn()
			await adapter.subscribeToGlobalChannel("test-channel", handler)

			expect(mockConnection.subscribe).toHaveBeenCalledWith(
				"global.test-channel",
			)
			expect(adapter.subscriptions.has("test-channel")).toBe(true)
		})

		it("should unsubscribe from global channel and drain messages", async () => {
			const adapter = new NatsAdapter(server)
			const mockSub = {
				drain: vi.fn(),
			}
			adapter.subscriptions.set("test-channel", mockSub)

			await adapter.unsubscribeFromGlobalChannel("test-channel")

			expect(mockSub.drain).toHaveBeenCalled()
			expect(adapter.subscriptions.has("test-channel")).toBe(false)
		})
	})
})
