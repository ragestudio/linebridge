import type * as Types from "./types"
import type * as Route from "./classes/Route"
import type { Server } from "./server"

declare global {
	var OperationError: typeof import("./classes/OperationError").default
	var Endpoint: typeof import("./classes/Endpoint").Endpoint

	var nats: any
	var ipc: any

	declare var __linebridge: any
	var defineRoute = Route.defineRoute

	/*
	  Boots the linebridge server with the provided class
	*/
	declare function Boot(base_class: any): void
	declare function ToBoolean(str: any): boolean

	type RouteFn<T> = Types.RouteFn<T>
	type WsRouteFn<T> = Types.WsRouteFn<T>

	declare type RouteObject<
		Child extends Server = Server,
		SelectedCtx extends ContextsKeys<Child> = ContextsKeys<Child>,
		Type extends RouteTypes = "http",
	> = Route.RouteObject<Child, SelectedCtx, Type>
}
