import type { NatsEngine } from "./engine"
import type { NatsRequest } from "./request"
import type { NatsResponse } from "./response"

declare module "linebridge/engines" {
	export interface EnginesRegistry {
		nats: typeof NatsEngine
	}
}

declare module "linebridge/types" {
	export interface EnginesRequests<T = any> {
		nats: NatsRequest
	}
	export interface EnginesResponses<T = any> {
		nats: NatsResponse
	}
}

export { NatsEngine, NatsRpcError } from "./engine"
export { NatsRequest } from "./request"
export { NatsResponse } from "./response"
export { defineNatsRoute } from "./route"

export {}
