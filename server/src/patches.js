import OperationError from "./classes/OperationError"
import Endpoint from "./classes/Endpoint"
import {
	Handler,
	HttpRequestHandler,
	MiddlewareHandler,
	WebsocketRequestHandler,
} from "./classes/Handler"

global.OperationError = OperationError
global.Endpoint = Endpoint
global.Handler = Handler
global.HttpRequestHandler = HttpRequestHandler
global.MiddlewareHandler = MiddlewareHandler
global.WebsocketRequestHandler = WebsocketRequestHandler
