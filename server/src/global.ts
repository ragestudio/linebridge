import { OperationError as M_OperationError } from "./classes/OperationError"
import { defineRoute as M_DefineRoute } from "./classes/Route"
import { defineMiddleware as M_DefineMiddleware } from "./classes/Handler/middleware"

import M_nanoid from "./utils/nanoid"
import M_toBoolean from "./utils/toBoolean"
import M_base64 from "./utils/base64"

declare global {
	var isProduction: boolean
	var OperationError: typeof M_OperationError
	var defineRoute: typeof M_DefineRoute
	var defineMiddleware: typeof M_DefineMiddleware
	var nanoid: typeof M_nanoid
	var ToBoolean: typeof M_toBoolean
	var b64Decode: typeof M_base64.decode
	var b64Encode: typeof M_base64.encode
}

global.isProduction = process.env.NODE_ENV === "production"

global.OperationError = M_OperationError
global.defineRoute = M_DefineRoute
global.defineMiddleware = M_DefineMiddleware
global.nanoid = M_nanoid
global.ToBoolean = M_toBoolean

global.b64Decode = M_base64.decode
global.b64Encode = M_base64.encode

export {}
