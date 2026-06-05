import Server from "./server"
import Route from "./classes/Route"
import registerBaseAliases from "./utils/registerAliases"
import type { OperationErrorType } from "./classes/OperationError"
import type {
	RouteTypes as _RouteTypes,
	defineRoute as _defineRoute,
} from "./classes/Route"
import type {
	KnownKeys as _KnownKeys,
	ContextsKeys as _ContextsKeys,
	MiddlewaresKeys as _MiddlewaresKeys,
} from "./types"

const version: string = require("../package.json").version

export { Server, Route, registerBaseAliases, version }

declare global {
	var OperationError: OperationErrorType

	var nats: any
	var ipc: any
	var __linebridge: any

	// Exposed globally so route files can define type-safe routes.
	var defineRoute: typeof _defineRoute

	// Convenience type aliases available without manual imports.
	type RouteTypes = _RouteTypes
	type KnownKeys<T> = _KnownKeys<T>
	type MiddlewaresKeys<T extends Server> = _MiddlewaresKeys<T>
	type ContextsKeys<T extends Server> = _ContextsKeys<T>

	/*
	  Boots the linebridge server with the provided class
	*/
	function Boot(base_class: any): void
	function ToBoolean(str: any): boolean
}
