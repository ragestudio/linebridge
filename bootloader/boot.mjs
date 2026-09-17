// boot.mjs
import dotenv from "dotenv"
import path from "node:path"
import { pathToFileURL } from "node:url"
import BootFn from "./boot_function.mjs"

dotenv.config({ quiet: true })

const entryFile = path.resolve(process.argv[2])

global.paths = {
	root: process.env.ROOT_PATH,
	__src: path.dirname(entryFile),
}

global.aliases = JSON.parse(process.env.BOOT_ALIASES)
global.Boot = BootFn

try {
	await import(pathToFileURL(entryFile).href)
} catch (error) {
	console.error("[BOOT] ❌ Boot error: ", error)
}
