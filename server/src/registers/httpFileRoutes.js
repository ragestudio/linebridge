import fs from "node:fs"

import Route from "../classes/Route"
import RecursiveRegister from "../utils/recursiveRegister"

const parametersRegex = /\[([a-zA-Z0-9_]+)\]/g

export default async (startDir, server) => {
	if (!fs.existsSync(startDir)) {
		return null
	}

	await RecursiveRegister({
		start: startDir,
		match: async (filePath) => {
			// Only match files named as HTTP methods (get.js, post.ts, etc.)
			const httpMethodRegex =
				/\/(get|post|put|delete|patch|options|head)\.(js|ts)$/i
			return httpMethodRegex.test(filePath)
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			const paths = relativePath.split("/")

			let method = paths[paths.length - 1]
				.split(".")[0]
				.toLocaleLowerCase()
			let route = paths.slice(0, paths.length - 1).join("/")

			// parse parametrized routes
			route = route.replace(parametersRegex, ":$1")
			route = route.replace("[$]", "*")

			// clean up
			route = route.replace(".js", "")
			route = route.replace(".ts", "")

			// check if route ends with index
			if (route.endsWith("/index")) {
				route = route.replace("/index", "")
			}

			// add leading slash
			route = `/${route}`

			// import endpoint
			let fileObj = await import(absolutePath)

			fileObj = fileObj.default ?? fileObj

			if (typeof fileObj !== "function") {
				if (typeof fileObj.fn !== "function") {
					console.warn(`Missing fn handler in [${method}][${route}]`)
					return false
				}
			}

			const routeParams = {
				route: route,
				filePath: absolutePath,
				useMiddlewares: fileObj.useMiddlewares,
				useContexts: fileObj.useContexts,
				handlers: {
					[method]: fileObj.fn ?? fileObj,
				},
			}

			new Route(server, routeParams).register()
		},
	})
}
