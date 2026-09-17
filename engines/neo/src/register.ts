import NeoEngine from "./engine"
import type NeoRequest from "./request"
import type NeoResponse from "./response"
import { registerEngine } from "linebridge/engines"

console.log("NEO Engine register via hook")
registerEngine("neo", NeoEngine)

export * from "./engine"

declare module "linebridge/engines" {
	export interface EnginesRegistry {
		neo: typeof NeoEngine
	}
}

declare module "linebridge/types" {
	export interface EnginesRequests<T> {
		neo: NeoRequest<T>
	}
	export interface EnginesResponses<T> {
		neo: NeoResponse<T>
	}
}
