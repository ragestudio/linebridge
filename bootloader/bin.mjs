import path from "node:path"
import fs from "node:fs"
import childProcess from "node:child_process"
import { pathToFileURL } from "node:url"
import Watcher from "./libs/watcher.mjs"

const mainModulePath = process.argv[2]

if (!mainModulePath) {
	console.error("[BOOT] No main script provided")
	process.exit(1)
}

const tsxUrl = import.meta.resolve("tsx")
const rootPath = process.env.ROOT_PATH ?? process.cwd()
const entryFile = path.resolve(mainModulePath)
const __src = path.dirname(entryFile)
const bootloaderPath = path.resolve(import.meta.dirname, "boot.mjs")
const aliasLoaderPath = path.resolve(import.meta.dirname, "./libs/aliases.mjs")

const bootAliases = {
	"@": __src,

	"@db": path.resolve(rootPath, "db"),
	"@shared-classes": path.resolve(rootPath, "classes"),
	"@shared-middlewares": path.resolve(rootPath, "middlewares"),
	"@shared-utils": path.resolve(rootPath, "utils"),
	"@shared-lib": path.resolve(rootPath, "lib"),

	"@classes": path.resolve(__src, "classes"),
	"@middlewares": path.resolve(__src, "middlewares"),
	"@routes": path.resolve(__src, "routes"),
	"@models": path.resolve(__src, "models"),
	"@config": path.resolve(__src, "config"),
	"@utils": path.resolve(__src, "utils"),
	"@lib": path.resolve(__src, "lib"),

	"@services": path.resolve(rootPath, "services"),
}

try {
	const pkgJsonPath = path.resolve(rootPath, "package.json")

	if (fs.existsSync(pkgJsonPath)) {
		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))

		if (typeof pkgJson.aliases === "object") {
			for (const [key, value] of Object.entries(pkgJson.aliases)) {
				bootAliases[key] = path.resolve(rootPath, value)
			}
		}
	}
} catch (err) {}

process.env.BOOT_ALIASES = JSON.stringify(bootAliases)
process.env.ROOT_PATH = rootPath

let watcher = null
let childProcessInstance = null
let reloadTimeout = null

function selfReload() {
	if (!childProcessInstance) {
		console.error(
			"[BOOT] Cannot self-reload. Missing childProcessInstance.",
		)
		return process.exit(0)
	}

	console.log("[BOOT] Reloading...")

	childProcessInstance.kill()

	runFork()
}

function selfReloadDebounce() {
	if (reloadTimeout) {
		clearTimeout(reloadTimeout)
	}

	reloadTimeout = setTimeout(selfReload, 300)
}

function runFork() {
	childProcessInstance = childProcess.fork(bootloaderPath, [mainModulePath], {
		stdio: "inherit",
		execArgv: [
			"--import",
			tsxUrl,
			"--import",
			pathToFileURL(aliasLoaderPath).href,
			...process.execArgv,
		],
	})
}

// if --watch flag exist, start file watcher
if (process.argv.includes("--watch")) {
	watcher = new Watcher(__src, { onReload: selfReloadDebounce })
	runFork()
} else {
	runFork()
}
