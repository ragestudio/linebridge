/**
 * @fileoverview Loads and initializes Linebridge plugins
 */

import type Server from "../server"

export default async (server: Server<any>): Promise<void | null> => {
	if (!Array.isArray(server.params.usePlugins)) {
		return null
	}

	for await (const plugin of server.params.usePlugins) {
		const inst = new plugin(server)

		// call the initialize lifecycle method if it exists
		if (typeof inst.initialize === "function") {
			await inst.initialize()
		}

		// store the plugin instance on the server for later access
		server.plugins.set(plugin.name, inst)
	}
}
