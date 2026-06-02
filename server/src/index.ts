import Server from "./server"
import Route from "./classes/Route"
import registerBaseAliases from "./utils/registerAliases"
import { OperationError } from "./classes/OperationError"
import type { OperationErrorType } from "./classes/OperationError"
import { defineRoute as _defineRoute } from "./classes/Route"
import type { RouteTypes, DefineRoute } from "./classes/Route"
import type { ContextsKeys } from "./types"

const version: string = require("../package.json").version

export { Server, Route, registerBaseAliases, version }

declare global {
	var OperationError: OperationErrorType

	var nats: any
	var ipc: any
	var __linebridge: any

	var defineRoute: DefineRoute

	/*
 	  Boots the linebridge server with the provided class
 	*/
	function Boot(base_class: any): void
	function ToBoolean(str: any): boolean
}
