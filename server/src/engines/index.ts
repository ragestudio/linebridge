/**
 * @fileoverview Internal engine registry mapping engine names to their implementations.
 * This is the entry point that the server uses to look up engine adaptors by name.
 */

import type EngineAdaptor from "../classes/EngineAdaptor"

export interface EnginesRegistry {}

export type Engines = EnginesRegistry & Record<string, typeof EngineAdaptor>

export const Engines: Engines = {} as Engines

export function registerEngine(name: string, engine: typeof EngineAdaptor) {
	Engines[name] = engine
}

export default Engines
