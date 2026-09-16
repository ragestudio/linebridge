import { Server } from "./server"
import { Plugin } from "./classes/Plugin"
import { Route } from "./classes/Route"
import { IPC } from "./classes/IPC"
import { NatsAdapter } from "./classes/Nats/adapter"

import type {
	ServerRequest as T_ServerRequest,
	ServerResponse as T_ServerResponse,
	KnownKeys as T_KnownKeys,
	ContextsKeys as T_ContextsKeys,
	MiddlewaresKeys as T_MiddlewaresKeys,
} from "./types"
import type {
	RouteTypes as T_RouteTypes,
	defineRoute as T_defineRoute,
} from "./classes/Route"
import type { defineMiddleware as T_defineMiddleware } from "./classes/Handler/middleware"

declare global {
	var nats: NatsAdapter
	var ipc: IPC
	var __linebridge: any

	var defineRoute: typeof T_defineRoute
	var defineMiddleware: typeof T_defineMiddleware

	type RouteTypes = T_RouteTypes
	type KnownKeys<T> = T_KnownKeys<T>
	type MiddlewaresKeys<T extends Server<any>> = T_MiddlewaresKeys<T>
	type ContextsKeys<T extends Server<any>> = T_ContextsKeys<T>

	type ServerRequest<T extends Server<any> = Server<any>> = T_ServerRequest<T>
	type ServerResponse<T extends Server<any> = Server<any>> =
		T_ServerResponse<T>
}

export type { Client as RTEClient } from "./classes/RtEngine/classes/client"
export type * from "./server"

export { Server, Plugin, Route }
