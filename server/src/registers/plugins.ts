/**
 * @fileoverview Loads and initializes Linebridge plugins specified in the
 * LINEBRIDGE_PLUGINS environment variable.
 *
 * Plugins are loaded from the lb-plugins directory (or a custom path set
 * via LINEBRIDGE_PLUGINS_PATH). Each plugin must export a default class
 * that accepts the server instance in its constructor. If the class has
 * an `initialize` method it is called after instantiation.
 *
 * Called during the server boot sequence.
 */

import fs from "node:fs"
import path from "node:path"
import type Server from "../server"

// directory where plugins are stored (defaults to cwd/lb-plugins)
const pluginsPath =
	process.env.LINEBRIDGE_PLUGINS_PATH ??
	path.join(process.cwd(), "lb-plugins")

/**
 * Reads the comma-separated list of plugin names from the LINEBRIDGE_PLUGINS
 * env variable, loads each plugin module, instantiates it with the server,
 * and calls its initialize method if present.
 *
 * @param server - the Linebridge server instance
 * @returns void, or null if no plugins are configured
 */
export default async (server: Server): Promise<void | null> => {
	// bail if the env variable is not set (no plugins to load)
	if (typeof process.env.LINEBRIDGE_PLUGINS !== "string") {
		return null
	}

	// split the comma-separated list into individual plugin names
	const plugins = process.env.LINEBRIDGE_PLUGINS.split(",")

	for await (const pluginName of plugins) {
		const pluginPath = path.join(pluginsPath, pluginName)

		// skip plugins that don't exist on disk
		if (!fs.existsSync(pluginPath)) {
			console.error(`Plugin ${pluginName} not found`)
			continue
		}

		// load the plugin module
		let Plugin = require(pluginPath)

		// a valid plugin must export a default class
		if (typeof Plugin.default === "undefined") {
			console.error(`Plugin ${pluginName} is not a valid plugin`)
			continue
		}

		// instantiate the plugin, passing the server instance
		Plugin = new Plugin.default(server)

		// store the plugin instance on the server for later access
		server.plugins.set(pluginName, Plugin)

		// call the initialize lifecycle method if it exists
		if (typeof Plugin.initialize === "function") {
			await Plugin.initialize()
		}
	}
}
