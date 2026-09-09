import { OperationError } from "./classes/OperationError"
import { defineRoute } from "./classes/Route"
import { defineMiddleware } from "./classes/Handler/middleware"

global.OperationError = OperationError
global.defineRoute = defineRoute
global.defineMiddleware = defineMiddleware
