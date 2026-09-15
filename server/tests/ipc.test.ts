import { loadLibs } from "../src/lazyNats"

loadLibs()

import { describe, it, expect, vi, beforeEach } from "vitest"
import IPC from "../src/classes/IPC/index"
import Server from "../src/server"

// Mock the nats module headers function
vi.mock("@nats-io/transport-node", () => ({
	headers: vi.fn(() => ({
		set: vi.fn(),
		get: vi.fn(),
	})),
}))

import { headers } from "@nats-io/transport-node"

describe("IPC Class", () => {
	let mockServer: any
	let mockNats: any
	let mockSubscription: any[]

	beforeEach(() => {
		mockSubscription = []
		// Add async iterator to mockSubscription so it can be used in for await
		;(mockSubscription as any)[Symbol.asyncIterator] = async function* () {
			for (const item of mockSubscription) {
				yield item
			}
		}

		mockNats = {
			subscribe: vi.fn().mockReturnValue(mockSubscription),
			request: vi.fn(),
		}

		mockServer = {
			params: {
				refName: "test-service",
			},
			ipcEvents: {},
			contexts: { db: true },
		}

		vi.spyOn(console, "error").mockImplementation(() => {})
	})

	describe("Initialization", () => {
		it("should throw if nats is missing", () => {
			expect(() => new IPC(mockServer, null as any)).toThrow(
				"NATS connection is not available",
			)
		})

		it("should throw if server is missing", () => {
			expect(() => new IPC(null as any, mockNats)).toThrow(
				"Server is not available",
			)
		})

		it("should throw if server.params.refName is missing", () => {
			mockServer.params.refName = undefined
			expect(() => new IPC(mockServer, mockNats)).toThrow(
				"Server reference name is not available",
			)
		})

		it("should initialize successfully and subscribe to the correct queue", () => {
			const ipc = new IPC(mockServer, mockNats)
			expect(ipc.isAvailable).toBe(true)
			expect(mockNats.subscribe).toHaveBeenCalledWith(
				"ipc_internal.test-service",
				{
					queue: "test-service-internal_ipc-worker",
				},
			)
		})
	})

	describe("handleReceivedEvent", () => {
		let ipc: IPC
		let mockMsg: any

		beforeEach(() => {
			ipc = new IPC(mockServer, mockNats)
			mockMsg = {
				headers: {
					get: vi.fn(),
				},
				data: ipc.codec.encode({ foo: "bar" }),
				respond: vi.fn(),
			}
		})

		it("should respond with error if headers are missing", async () => {
			mockMsg.headers = undefined
			await ipc.handleReceivedEvent(mockMsg)
			expect(mockMsg.respond).toHaveBeenCalled()

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.error).toBe("Missing headers")
		})

		it("should respond with error if event header is missing", async () => {
			mockMsg.headers.get.mockReturnValue(null)
			await ipc.handleReceivedEvent(mockMsg)

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.error).toBe("Missing event")
		})

		it("should respond with error if ipcEvents is not initialized", async () => {
			mockMsg.headers.get.mockReturnValue("doWork")
			mockServer.ipcEvents = undefined
			await ipc.handleReceivedEvent(mockMsg)

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.error).toBe("IPC events not initialized")
		})

		it("should respond with error if event is not found", async () => {
			mockMsg.headers.get.mockReturnValue("doWork")
			mockServer.ipcEvents = {}
			await ipc.handleReceivedEvent(mockMsg)

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.error).toBe("Event [doWork] not found")
		})

		it("should execute the event and respond with result", async () => {
			mockMsg.headers.get.mockReturnValue("doWork")

			const mockHandler = vi.fn().mockResolvedValue({ success: true })
			mockServer.ipcEvents = {
				doWork: mockHandler,
			}

			await ipc.handleReceivedEvent(mockMsg)

			expect(mockHandler).toHaveBeenCalledWith(mockServer.contexts, {
				foo: "bar",
			})

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.data).toEqual({ success: true })
		})

		it("should respond with error if handler throws", async () => {
			mockMsg.headers.get.mockReturnValue("doWork")

			const mockHandler = vi
				.fn()
				.mockRejectedValue(new Error("Handler failure"))
			mockServer.ipcEvents = {
				doWork: mockHandler,
			}

			await ipc.handleReceivedEvent(mockMsg)

			const response = ipc.codec.decode(
				mockMsg.respond.mock.calls[0][0],
			) as any
			expect(response.error).toBe("Handler failure")
		})
	})

	describe("invoke", () => {
		let ipc: IPC

		beforeEach(() => {
			ipc = new IPC(mockServer, mockNats)

			// Mock successful request response by default
			mockNats.request.mockResolvedValue({
				data: ipc.codec.encode({ data: { hello: "world" } }),
			})
		})

		it("should return null if nats is not available", async () => {
			ipc.nats = null as any
			const result = await ipc.invoke("target", "cmd")
			expect(result).toBeNull()
		})

		it("should set headers correctly and request via NATS", async () => {
			const mockSet = vi.fn()
			;(headers as any).mockReturnValue({ set: mockSet })

			await ipc.invoke("other-service", "doTask", { req: "payload" })

			expect(mockSet).toHaveBeenCalledWith("event", "doTask")
			expect(mockNats.request).toHaveBeenCalledWith(
				"ipc_internal.other-service",
				expect.any(Uint8Array),
				expect.objectContaining({ timeout: 50000 }),
			)
		})

		it("should throw if no response is received", async () => {
			mockNats.request.mockResolvedValue(null)
			await expect(ipc.invoke("target", "cmd")).rejects.toThrow(
				"No response received",
			)
		})

		it("should throw if no data in response", async () => {
			mockNats.request.mockResolvedValue({ data: null })
			await expect(ipc.invoke("target", "cmd")).rejects.toThrow(
				"No data received",
			)
		})

		it("should throw if response contains an error", async () => {
			mockNats.request.mockResolvedValue({
				data: ipc.codec.encode({ error: "Remote service error" }),
			})
			await expect(ipc.invoke("target", "cmd")).rejects.toThrow(
				"Remote service error",
			)
		})

		it("should return the response data on success", async () => {
			const result = await ipc.invoke("target", "cmd")
			expect(result).toEqual({ hello: "world" })
		})
	})
})
