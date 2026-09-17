import type { NeoEngine } from "./engine"
import type Request from "./request"
import type Response from "./response"

declare module "linebridge/engines" {
	export interface EnginesRegistry {
		neo: typeof NeoEngine
	}
}

declare module "linebridge/types" {
	export interface EnginesRequests<T = any> {
		neo: Request<T>
	}
	export interface EnginesResponses<T = any> {
		neo: Response<T>
	}
}

export {}
