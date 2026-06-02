import fs from "node:fs"

import Route, { RouteHttpMethods } from "../classes/Route"
import RecursiveRegister from "../utils/recursiveRegister"
import type Server from "../server"

const parametersRegex = /\[([a-zA-Z0-9_]+)\]/g

export default async (
	startDir: string,
	server: Server,
): Promise<void | null> => {
	if (!fs.existsSync(startDir)) {
		return null
	}

	await RecursiveRegister({
		start: startDir,
		match: async (filePath: string) => {
			const httpMethodRegex =
				/\/(get|post|put|delete|patch|options|head)\.(js|ts)$/i
			return httpMethodRegex.test(filePath)
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			const paths = relativePath.split("/")

			let method = paths[paths.length - 1].split(".")[0].toLocaleLowerCase()
			let path = paths.slice(0, paths.length - 1).join("/")

			path = path.replace(parametersRegex, ":$1")
			path = path.replace("[$]", "*")

			path = path.replace(".js", "")
			path = path.replace(".ts", "")

			if (path.endsWith("/index")) {
				path = path.replace("/index", "")
			}

			path = `/${path}`

			let fileObj = require(absolutePath)

			fileObj = fileObj.default ?? fileObj

			if (typeof fileObj !== "function") {
				if (typeof fileObj.fn !== "function") {
					console.warn(`Missing fn handler in [${method}][${path}]`)
					return false
				}
			}

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
