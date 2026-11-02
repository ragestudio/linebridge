import { describe, it, expect } from "vitest"
import Route from "../src/classes/Route/index"
import Server from "../src/server"
import { HandlerKind } from "../src/classes/Handler"
import EngineAdaptor from "../src/classes/EngineAdaptor"

class MockEngine extends EngineAdaptor {
	constructor(server: Server) {
		super(server)
	}
}

describe("Route generic", () => {
	it("keeps the subject and skips http path parsing", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const route = new Route()
		route.kind = HandlerKind.generic
		route.path = "sfu.ping"
		route.fn = async () => true

		route._initialize(server)

		expect(route.kind).toBe(HandlerKind.generic)
		expect(route.path).toBe("sfu.ping")
		expect(route.pathParametersKey).toEqual([])
		expect(route.handler.kind).toBe(HandlerKind.generic)
	})

	it("resolves contexts for generic routes", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any
		server.contexts = { ctx: { value: 42 } }

		const route = new Route()
		route.kind = HandlerKind.generic
		route.path = "sfu.ctx"
		;(route as any).useContexts = ["ctx"]
		route.fn = async () => true

		route._initialize(server)

		expect(route.ctx.ctx).toEqual({ value: 42 })
	})

	it("accepts generic middleware objects and resolves their contexts", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const routers = { findById: () => undefined }
		server.contexts = { routers }

		const middlewareFn = async () => true

		const route = new Route()
		route.kind = HandlerKind.generic
		route.path = "sfu.middleware"
		;(route as any).useMiddlewares = [
			{ useContexts: ["routers"], fn: middlewareFn },
		]
		route.fn = async () => true

		route._initialize(server)

		expect(route.middlewares).toHaveLength(1)
		expect(route.middlewares[0].kind).toBe(HandlerKind.generic)
		expect(route.middlewares[0].fn).toBe(middlewareFn)
		expect(route.middlewares[0].ctx).toEqual({ routers })
	})
})
