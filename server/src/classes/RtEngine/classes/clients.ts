/**
 * Clients collection for the RTEngine subsystem.
 *
 * Extends the native Map to store connected Client instances keyed by their id.
 *
 * @module RtEngine/Clients
 */

import type RTEngine from "../index"
import type Client from "./client"

/**
 * A Map-based collection of connected WebSocket clients.
 *
 * Each entry maps a client id (string) to a Client instance.
 * Provides access to the parent RTEngine for context.
 */
export default class Clients extends Map<string, Client> {
	/** The parent RTEngine instance that owns this collection */
	engine: RTEngine

	/**
	 * Creates a new Clients collection bound to the given engine.
	 *
	 * @param engine - The parent RTEngine instance
	 */
	constructor(engine: RTEngine) {
		super()
		this.engine = engine
	}
}
