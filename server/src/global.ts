import OperationError from "./classes/OperationError"
//import type { Server } from "."
//import * as Types from "./types"
import * as Route from "./classes/Route"

global.OperationError = OperationError
global.defineRoute = Route.defineRoute

declare global {
	var OperationError: typeof import("./classes/OperationError").default

	var nats: any
	var ipc: any
	var __linebridge: any

	var defineRoute: typeof Route.defineRoute
	var RouteObject: Route.RouteObject

	/*
	  Boots the linebridge server with the provided class
	*/
	function Boot(base_class: any): void
	function ToBoolean(str: any): boolean
}
