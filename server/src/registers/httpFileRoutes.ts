/**
 * @fileoverview Scans the routes/ directory for HTTP route handler files
 * and registers them with the server engine.
 *
 * The HTTP method is derived from the filename (e.g. "get.ts" => GET,
 * "post.ts" => POST). The URL path is derived from the directory structure.
 * Square-bracket segments like [id] become Express-style path parameters
 * (:id), and [$] becomes a catch-all wildcard (*).
 *
 * Example directory structure:
 *   routes/users/[id]/get.ts  =>  GET /users/:id
 *
 * Called during the server boot sequence.
 */

import fs from "node:fs"

import Route, { RouteHttpMethods } from "../classes/Route"
import RecursiveRegister from "../utils/recursiveRegister"
import type Server from "../server"

// matches [paramName] segments in directory names
const parametersRegex = /\[([a-zA-Z0-9_]+)\]/g

/**
 * Walks the given start directory recursively, matches HTTP method files,
 * derives paths from the directory structure, and registers each route
 * with the server engine.
 *
 * @param startDir - absolute path to the routes directory
 * @param server   - the Linebridge server instance
 * @returns void, or null if the directory does not exist
 */
export default async (
	startDir: string,
	server: Server,
): Promise<void | null> => {
	// bail if the routes directory does not exist
	if (!fs.existsSync(startDir)) {
		return null
	}

	await RecursiveRegister({
		start: startDir,
		match: async (filePath: string) => {
			// only match files named as valid HTTP methods (get.ts, post.ts, etc.)
			const httpMethodRegex =
				/\/(get|post|put|delete|patch|options|head)\.(js|ts)$/i
			return httpMethodRegex.test(filePath)
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			const paths = relativePath.split("/")

			// extract the HTTP method from the filename (before the first dot)
			let method = paths[paths.length - 1]
				.split(".")[0]
				.toLocaleLowerCase()
			// join directory segments to form the URL path
			let path = paths.slice(0, paths.length - 1).join("/")

			// convert [param] => :param and [$] => * (catch-all)
			path = path.replace(parametersRegex, ":$1")
			path = path.replace("[$]", "*")

			// strip any leftover .js/.ts extensions (safety)
			path = path.replace(".js", "")
			path = path.replace(".ts", "")

			// treat "index" files as the directory root
			if (path.endsWith("/index")) {
				path = path.replace("/index", "")
			}

			// ensure the path starts with a leading slash
			path = `/${path}`

			// load the handler module
			let fileObj = require(absolutePath)

			// support both default and named exports
			fileObj = fileObj.default ?? fileObj

			if (typeof fileObj !== "function") {
				if (typeof fileObj.fn !== "function") {
					console.warn(`Missing fn handler in [${method}][${path}]`)
					return false
				}
			}

			// build the route object and register it with the engine
			const routeClass = new Route()

			routeClass.path = path
			routeClass.useContexts = fileObj.useContexts
			routeClass.useMiddlewares = fileObj.useMiddlewares
			routeClass.method = method as RouteHttpMethods
			routeClass.handler = fileObj.fn ?? fileObj

			server.engine.register(routeClass)
		},
	})
}
