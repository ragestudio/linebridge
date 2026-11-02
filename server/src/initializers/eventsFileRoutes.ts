/**
 * @fileoverview Scans the events/ directory for generic event handlers.
 *
 * File paths are converted to dotted endpoints (e.g.
 * events/sfu/createRouter.ts -> "sfu.createRouter") and registered with
 * kind "generic". Only runs for engines that use the generic transport.
 */

import type Server from "../server"

import fs from "node:fs"

import Route from "../classes/Route"
import { HandlerKind } from "../classes/Handler"
import RecursiveRegister from "../utils/recursiveRegister"

export default async (
	startDir: string,
	server: Server<any>,
): Promise<typeof server | null> => {
	if (server.engine?.transport !== "generic") {
		return null
	}

	if (!fs.existsSync(startDir)) {
		return null
	}

	await RecursiveRegister({
		start: startDir,
		match: (filePath: string) => {
			return filePath.endsWith(".js") || filePath.endsWith(".ts")
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			relativePath = relativePath.split(".")[0]

			const segments = relativePath.split("/")

			if (segments[segments.length - 1] === "index") {
				segments.pop()
			}

			const endpoint = segments.join(".")

			let fileObj = await import(absolutePath)

			fileObj =
				fileObj["module.exports"]?.default ?? fileObj.default ?? fileObj

			const fn = typeof fileObj === "function" ? fileObj : fileObj.fn

			if (typeof fn !== "function") {
				console.warn(`Missing fn handler in event [${endpoint}]`)
				return false
			}

			const route = new Route()

			route.kind = HandlerKind.generic
			route.path = endpoint
			route.useContexts = fileObj.useContexts ?? []
			route.useMiddlewares = fileObj.useMiddlewares ?? []
			route.fn = fn
			route._source_file = absolutePath

			server.register(route, HandlerKind.generic)
		},
	})

	return server
}
