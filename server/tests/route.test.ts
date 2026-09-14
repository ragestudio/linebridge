import { describe, it, expect, vi } from "vitest"
import Route from "../src/classes/Route/index"
import Server from "../src/server"
import { HandlerKind } from "../src/classes/Handler"
import EngineAdaptor from "../src/classes/EngineAdaptor"

class MockEngine extends EngineAdaptor {
	constructor(server: Server) {
		super(server)
	}
}

describe("Route Class", () => {
	it("should initialize with default values", () => {
		const route = new Route()
		expect(route.kind).toBe(HandlerKind.http)
		expect(route.path).toBe("/")
		expect(route.method).toBe("get")
		expect(route.useContexts).toEqual([])
		expect(route.useMiddlewares).toEqual([])
	})

	it("should throw error if initialized without server", () => {
		const route = new Route()
		expect(() => route._initialize(null as any)).toThrow(
			"server is not defined",
		)
	})

	it("should parse path parameters", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const route = new Route()
		route.fn = () => {}

		route._initialize(server, {
			path: "/users/:userId/posts/:postId",
			method: "get",
		} as any)

		expect(route.path).toBe("/users/:userId/posts/:postId")
		expect(route.pathParametersKey).toEqual([
			["userId", 0],
			["postId", 1],
		])
	})

	it("should resolve middlewares from the server", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const mw1 = vi.fn()
		server.middlewares = { mw1 }

		const route = new Route()
		route.fn = () => {}

		route._initialize(server, {
			useMiddlewares: ["mw1"],
		} as any)

		expect(route.middlewares.length).toBe(1)
		expect(route.middlewares[0].fn).toBe(mw1)
		expect(route.middlewares[0].kind).toBe(HandlerKind.middleware)
	})

	it("should resolve contexts from the server", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const dbContext = { connect: () => {} }
		server.contexts = { db: dbContext }

		const route = new Route()
		route.fn = () => {}

		route._initialize(server, {
			useContexts: ["db"],
		} as any)

		expect(route.ctx["db"]).toBe(dbContext)
	})

	it("should throw error if no handler or fn is defined", () => {
		const server = new Server()
		server.engine = new MockEngine(server) as any

		const route = new Route()

		expect(() => route._initialize(server)).toThrow(
			"Route [/] does not have a handler or fn",
		)
	})
})
