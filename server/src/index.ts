import Server from "./server"
import { Plugin } from "./classes/Plugin"
import Route from "./classes/Route"
import IPC from "./classes/IPC"
import NatsAdapter from "./classes/Nats/adapter"
import registerBaseAliases from "./utils/registerAliases"

import type {
	ServerRequest as _ServerRequest,
	ServerResponse as _ServerResponse,
	KnownKeys as _KnownKeys,
	ContextsKeys as _ContextsKeys,
	MiddlewaresKeys as _MiddlewaresKeys,
} from "./types"
import type { OperationErrorType } from "./classes/OperationError"
import type {
	RouteTypes as _RouteTypes,
	defineRoute as _defineRoute,
} from "./classes/Route"
import type { defineMiddleware as _defineMiddleware } from "./classes/Handler/middleware"

const version: string = require("../package.json").version

export type { Client as RTEClient } from "./classes/RtEngine/classes/client"

export { Server, Plugin, Route, registerBaseAliases, version }

declare global {
	var OperationError: OperationErrorType

	var nats: NatsAdapter
	var ipc: IPC
	var __linebridge: any

	var defineRoute: typeof _defineRoute
	var defineMiddleware: typeof _defineMiddleware

	type RouteTypes = _RouteTypes
	type KnownKeys<T> = _KnownKeys<T>
	type MiddlewaresKeys<T extends Server<any>> = _MiddlewaresKeys<T>
	type ContextsKeys<T extends Server<any>> = _ContextsKeys<T>

	type ServerRequest<T extends Server<any> = Server<any>> = _ServerRequest<T>
	type ServerResponse<T extends Server<any> = Server<any>> =
		_ServerResponse<T>

	function Boot(base_class: any): void
	function ToBoolean(str: any): boolean
}
