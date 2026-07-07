/**
 * Abstract interface that every engine implementation must satisfy.
 *
 * The engine is the underlying HTTP/WebSocket server. Currently only
 * "neo" (uWebSockets.js) is implemented, but this adaptor class makes
 * it possible to swap in alternatives later.
 *
 * Engine implementations are plain objects/classes with these methods,
 * not instances of EngineAdaptor - the adaptor exists for TypeScript typing.
 */
import type LinebridgeServer from "../../server"
import type { MiddlewareHandlerFunction } from "../Handler"
import type { RouteAlike } from "../Route"
import type RTEngine from "../RtEngine"

export class EngineAdaptor {
	constructor(server: LinebridgeServer) {
		this.server = server
	}

	/** Unix socket path when running in socket mode (LB_SOCKET_MODE). */
	socket_path?: string

	/** Reference back to the Server instance that owns this engine. */
	server: LinebridgeServer

	/** WebSocket layer (RTEngine instance) if websockets are enabled. */
	ws!: RTEngine | null

	/** Set of registered routes as { method, path } objects. */
	registers: Set<Record<string, string>> = new Set()

	/** Registers an HTTP route (called by route_register). */
	register!: (route: RouteAlike) => void

	/** Registers a global middleware. */
	register_middleware!: (middleware: MiddlewareHandlerFunction) => void

	/** Async init - sets up SSL, creates the underlying server app, etc. */
	initialize!: () => Promise<void>

	/** Starts accepting connections. */
	listen!: () => Promise<void>

	/** Gracefully shuts down the server. */
	close!: () => Promise<boolean>

	/** Base headers to include in all responses. */
	base_headers!: Record<string, string>;

	/** Index signature for engine-specific properties. */
	[property: string]: any
}

export default EngineAdaptor
