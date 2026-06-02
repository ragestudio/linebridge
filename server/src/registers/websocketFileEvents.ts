import fs from "node:fs"

import RecursiveRegister from "../utils/recursiveRegister"
import type Server from "../server"

export default async (
	startDir: string,
	server: Server,
): Promise<typeof server | null> => {
	if (!server.engine?.ws || !fs.existsSync(startDir)) {
		return null
	}

	let events: Record<string, any> = {}

	await RecursiveRegister({
		start: startDir,
		match: (filePath: string) => {
			return filePath.endsWith(".js") || filePath.endsWith(".ts")
		},
		onMatch: async ({ absolutePath, relativePath }) => {
			relativePath = relativePath.split(".")[0]

			const paths = relativePath.split("/")
			let fileObj = await import(absolutePath)

			fileObj = fileObj.default ?? fileObj

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

	if (typeof server.engine.ws!.registerEvents === "function") {
		await server.engine.ws!.registerEvents(events)
	} else {
		for (const eventKey of Object.keys(events)) {
			server.engine.ws!.events.set(eventKey, events[eventKey])
		}
	}

	return server
}
