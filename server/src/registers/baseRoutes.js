import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"

export default async (server) => {
	const scanPath = path.resolve(Vars.libPath, "baseRoutes")
	const files = fs.readdirSync(scanPath)

	for await (const file of files) {
		if (file === "index.js") {
			continue
		}

		let RouteModule = await import(path.join(scanPath, file))

		RouteModule = RouteModule.default

		new RouteModule(server).register()
	}
}
