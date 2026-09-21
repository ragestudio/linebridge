// boot.mjs
import path from "node:path"

const entryFile = path.resolve(process.argv[2])

global.paths = {
	root: process.env.ROOT_PATH,
	__src: path.dirname(entryFile),
}

import { pathToFileURL } from "node:url"
import BootFn from "./boot_function.mjs"
import EnvLoad from "./libs/env.mjs"

EnvLoad()

global.aliases = JSON.parse(process.env.BOOT_ALIASES)
global.Boot = BootFn

try {
	const mainMod = await import(pathToFileURL(entryFile).href)

	if (typeof mainMod.default !== "function") {
		console.error("[BOOT] ❌ Main module doesnt provide a default function")
	} else {
		BootFn(mainMod.default)
	}
} catch (error) {
	console.error("[BOOT] ❌ Boot error: ", error)
}
