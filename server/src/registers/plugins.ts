import fs from "node:fs"
import path from "node:path"
import type Server from "../server"

const pluginsPath =
	process.env.LINEBRIDGE_PLUGINS_PATH ?? path.join(process.cwd(), "lb-plugins")

export default async (server: Server): Promise<void | null> => {
	if (typeof process.env.LINEBRIDGE_PLUGINS !== "string") {
		return null
	}

	const plugins = process.env.LINEBRIDGE_PLUGINS.split(",")

	for await (const pluginName of plugins) {
		const pluginPath = path.join(pluginsPath, pluginName)

		if (!fs.existsSync(pluginPath)) {
			console.error(`Plugin ${pluginName} not found`)
			continue
		}

		let Plugin = require(pluginPath)

		if (typeof Plugin.default === "undefined") {
			console.error(`Plugin ${pluginName} is not a valid plugin`)
			continue
		}

		Plugin = new Plugin.default(server)

		server.plugins.set(pluginName, Plugin)

		if (typeof Plugin.initialize === "function") {
			await Plugin.initialize()
		}
	}
}
