import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"
import type Server from "../server"
import type { Route } from "../classes/Route"

export default async (server: Server): Promise<void> => {
	const scanPath = path.resolve(Vars.libPath, "baseRoutes")
	const files = fs.readdirSync(scanPath)

	for await (const file of files) {
		if (file === "index.js") {
			continue
		}

		let mod = await import(path.join(scanPath, file))

		server.engine.register(new (mod.default as typeof Route<Server>)())
	}
}
