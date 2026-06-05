/**
 * @fileoverview Scans the ws_routes/ directory for WebSocket event handler files
 * and registers them with the server's WebSocket engine.
 *
 * Each .js or .ts file found becomes a WebSocket event identified by its
 * directory path joined with colons (e.g. "topic:subscribe"). The file must
 * export either a handler function directly (default export) or an object
 * with a `fn` property containing the handler.
 *
 * Called during the server boot sequence.
 */

import fs from "node:fs"

import RecursiveRegister from "../utils/recursiveRegister"
import type Server from "../server"

/**
 * Walks the given start directory recursively, finds .js/.ts files,
 * loads them as WebSocket event handlers, and registers them with the
 * server's WebSocket engine.
 *
 * @param startDir - absolute path to the ws_routes directory
 * @param server   - the Linebridge server instance
 * @returns the server instance on success, or null if registration is not possible
 */
export default async (
	startDir: string,
	server: Server,
): Promise<typeof server | null> => {
	// bail if WebSocket is not enabled or the directory doesn't exist
	if (!server.engine?.ws || !fs.existsSync(startDir)) {
		return null
	}

	// will hold event_name -> handler mappings
	let events: Record<string, any> = {}

	// recursively walk the directory and load matching files
	await RecursiveRegister({
		start: startDir,
		match: (filePath: string) => {
			// only consider JavaScript or TypeScript files
			return filePath.endsWith(".js") || filePath.endsWith(".ts")
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			// strip file extension to use the path as the event name
			relativePath = relativePath.split(".")[0]

			const paths = relativePath.split("/")
			let fileObj = require(absolutePath)

			// handle both default and named exports
			fileObj = fileObj.default ?? fileObj

			// join path segments with colons to form the event name
			// e.g. "topic/subscribe" becomes "topic:subscribe"
			const route = paths.join(":")

			if (typeof fileObj !== "function") {
				if (typeof fileObj.fn !== "function") {
					console.warn(
						`Missing fn handler in websocket file event [${route}]`,
					)
					return false
				}
			}

			events[route] = fileObj
		},
	})

	if (typeof events !== "object") {
		return null
	}

	// register all found events with the WebSocket engine
	if (typeof server.engine.ws!.registerEvents === "function") {
		await server.engine.ws!.registerEvents(events)
	} else {
		// fallback: manually set each event on the events Map
		for (const eventKey of Object.keys(events)) {
			server.engine.ws!.events.set(eventKey, events[eventKey])
		}
	}

	return server
}
