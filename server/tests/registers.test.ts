import { describe, it, expect, vi, beforeEach } from "vitest"
import path from "node:path"
import net from "node:net"

import baseHeadersRegister from "../src/registers/baseHeaders"
import baseMiddlewaresRegister from "../src/registers/baseMiddlewares"
import pluginsRegister from "../src/registers/plugins"
import httpFileRoutesRegister from "../src/registers/httpFileRoutes"
import websocketFileEventsRegister from "../src/registers/websocketFileEvents"
import gatewayRegister from "../src/registers/gateway"
import ipcServiceRegister from "../src/registers/ipcService"

import getRoutes from "../src/utils/getRoutes"
import Vars from "../src/vars"
import Route from "../src/classes/Route"

vi.mock("node:net", () => {
	class MockSocket {
		declare connect: any
		declare write: any
		declare end: any
	}

	MockSocket.prototype.connect = vi.fn()
	MockSocket.prototype.write = vi.fn()
	MockSocket.prototype.end = vi.fn()

	return {
		default: { Socket: MockSocket },
		Socket: MockSocket,
	}
})

vi.mock("../src/utils/getRoutes", () => ({
	default: vi.fn(),
}))

describe("Registers", () => {
	let mockServer: any
	let mockEngine: any
	let mockWsEngine: any

	beforeEach(() => {
		mockWsEngine = {
			registerEvents: vi.fn(),
			events: new Map(),
		}

		mockEngine = {
			base_headers: {},
			register_middleware: vi.fn(),
			register: vi.fn(),
			ws: mockWsEngine,
		}

		mockServer = {
			engine: mockEngine,
			headers: { "X-Custom": "test" },
			middlewares: { customMw: vi.fn() },
			params: {},
			plugins: new Map(),
		}

		vi.spyOn(console, "warn").mockImplementation(() => {})
	})

	describe("baseHeaders", () => {
		it("should return null if server or engine is missing", () => {
			expect(baseHeadersRegister(null as any)).toBeNull()
			expect(baseHeadersRegister({} as any)).toBeNull()
		})

		it("should merge server headers with base headers and assign to engine", () => {
			Vars.baseHeaders = { "X-Base": "base-value" }
			baseHeadersRegister(mockServer)
			expect(mockEngine.base_headers).toEqual({
				"X-Custom": "test",
				"X-Base": "base-value",
			})
		})
	})

	describe("baseMiddlewares", () => {
		it("should resolve and register selected middlewares", async () => {
			Vars.baseMiddlewares = { baseMw: vi.fn() }

			// server.params.useMiddlewares selects which ones to actually register
			mockServer.params.useMiddlewares = ["customMw", "baseMw"]

			await baseMiddlewaresRegister(mockServer)

			// The register_middleware is called once per resolved middleware
			expect(mockEngine.register_middleware).toHaveBeenCalledTimes(2)
		})
	})

	describe("plugins", () => {
		it("should return null if usePlugins is not an array", async () => {
			mockServer.params.usePlugins = undefined
			const res = await pluginsRegister(mockServer)
			expect(res).toBeNull()
		})

		it("should instantiate and initialize plugins, and store them", async () => {
			const mockInitialize = vi.fn()
			class TestPlugin {
				static name = "TestPlugin"
				initialize = mockInitialize
				constructor(server: any) {
					expect(server).toBe(mockServer)
				}
			}

			mockServer.params.usePlugins = [TestPlugin]

			await pluginsRegister(mockServer)

			expect(mockInitialize).toHaveBeenCalled()
			expect(mockServer.plugins.has("TestPlugin")).toBe(true)
			expect(mockServer.plugins.get("TestPlugin")).toBeInstanceOf(
				TestPlugin,
			)
		})
	})

	describe("httpFileRoutes", () => {
		const routesDir = path.join(__dirname, "fixtures", "routes")

		it("should return null if directory does not exist", async () => {
			const res = await httpFileRoutesRegister(
				"/does/not/exist",
				mockServer,
			)
			expect(res).toBeNull()
		})

		it("should recursively register routes from files", async () => {
			await httpFileRoutesRegister(routesDir, mockServer)

			// Fixture path: users/[id]/get.ts -> expects method: 'get', path: '/users/:id'
			expect(mockEngine.register).toHaveBeenCalled()
			const registeredRoute = mockEngine.register.mock
				.calls[0][0] as Route

			expect(registeredRoute).toBeInstanceOf(Route)
			expect(registeredRoute.method).toBe("get")
			expect(registeredRoute.path).toBe("/users/:id")
			expect(registeredRoute.useContexts).toEqual(["db"])
			expect(registeredRoute.useMiddlewares).toEqual(["auth"])
			expect(typeof registeredRoute.fn).toBe("function")
		})
	})

	describe("websocketFileEvents", () => {
		const wsRoutesDir = path.join(__dirname, "fixtures", "ws_routes")

		it("should return null if ws engine or directory is missing", async () => {
			mockEngine.ws = null
			let res = await websocketFileEventsRegister(wsRoutesDir, mockServer)
			expect(res).toBeNull()

			mockEngine.ws = mockWsEngine
			res = await websocketFileEventsRegister(
				"/does/not/exist",
				mockServer,
			)
			expect(res).toBeNull()
		})

		it("should recursively register ws events from files", async () => {
			await websocketFileEventsRegister(wsRoutesDir, mockServer)

			// Fixture path: topic/subscribe.ts -> expects event: 'topic:subscribe'
			expect(mockWsEngine.registerEvents).toHaveBeenCalled()
			const eventsMap = mockWsEngine.registerEvents.mock.calls[0][0]

			expect(eventsMap).toHaveProperty("topic:subscribe")
			expect(typeof eventsMap["topic:subscribe"].fn).toBe("function")
		})
	})

	describe("gateway", () => {
		it("should return null if LB_GATEWAY_SOCKET is not set", async () => {
			const originalEnv = process.env.LB_GATEWAY_SOCKET
			delete process.env.LB_GATEWAY_SOCKET
			const res = await gatewayRegister(mockServer)
			expect(res).toBeNull()
			process.env.LB_GATEWAY_SOCKET = originalEnv
		})

		it("should send registration payload to gateway socket", async () => {
			process.env.LB_GATEWAY_SOCKET = "/tmp/test.sock"
			mockServer.params.refName = "test-svc"
			mockServer.params.listenIp = "0.0.0.0"
			mockServer.params.listenPort = 3000

			vi.mocked(getRoutes).mockReturnValue({
				http: { get: [{ path: "/api/test" }] },
				websocket: ["test:event"],
			})

			await gatewayRegister(mockServer)

			// We need to verify connect and write were called on the socket prototype
			const connectSpy = vi.mocked(net.Socket.prototype.connect)
			const writeSpy = vi.mocked(net.Socket.prototype.write)

			expect(connectSpy).toHaveBeenCalledWith("/tmp/test.sock")

			// Validate payload
			const writtenPayloadStr = writeSpy.mock.calls[0][0]
			const payload = JSON.parse(writtenPayloadStr.toString())
			expect(payload.event).toBe("service:register")
			expect(payload.data.namespace).toBe("test-svc")
			expect(payload.data.http.paths).toContain("/api/test")
			expect(payload.data.websocket.events).toContain("test:event")
		})
	})

	describe("ipcService", () => {
		it("should return null if lb_service or process.send is unavailable", async () => {
			const originalLb = process.env.lb_service
			delete process.env.lb_service
			const res = await ipcServiceRegister(mockServer)
			expect(res).toBeNull()
			process.env.lb_service = originalLb
		})

		it("should send IPC message to parent process", async () => {
			process.env.lb_service = "true"
			const mockSend = vi.fn()
			process.send = mockSend

			mockServer.params.refName = "test-svc-ipc"
			vi.mocked(getRoutes).mockReturnValue({
				http: { post: [{ path: "/api/ipc" }] },
				websocket: ["ipc:event"],
			})

			await ipcServiceRegister(mockServer)

			expect(mockSend).toHaveBeenCalled()
			const payload = mockSend.mock.calls[0][0]
			expect(payload.type).toBe("service:register")
			expect(payload.data.namespace).toBe("test-svc-ipc")
			expect(payload.data.http.paths).toContain("/api/ipc")
			expect(payload.data.websocket.events).toContain("ipc:event")
		})
	})
})
