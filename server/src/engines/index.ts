/**
 * @fileoverview Internal engine registry mapping engine names to their implementations.
 * This is the entry point that the server uses to look up engine adaptors by name.
 */

import type EngineAdaptor from "../classes/EngineAdaptor"

import neo from "./neo"

export interface EnginesRegistry {
	neo: typeof neo
}

export type Engines = EnginesRegistry & Record<string, typeof EngineAdaptor>

export const Engines: Engines = {
	neo: neo,
}

export default Engines
