import path from "node:path"
import fs from "node:fs"
import childProcess from "node:child_process"
import Watcher from "../libs/watcher.mjs"
import { command } from "cleye"

const preloaderPath = path.resolve(import.meta.dirname, "../boot_preloader.mjs")

const tsxLoader = import.meta.resolve("tsx")
const aliasesLoader = import.meta.resolve("../loaders/aliases.mjs")

const loaders = [tsxLoader, aliasesLoader]

let watcher = null
let mainFile = null
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
	if (!mainFile) return null

	const loadersArgs = []

	for (const loaderPath of loaders) {
		loadersArgs.push("--import")
		loadersArgs.push(loaderPath)
	}

	childProcessInstance = childProcess.fork(preloaderPath, [mainFile], {
		stdio: "inherit",
		execArgv: [...loadersArgs, ...process.execArgv],
	})
}

export function boot(args) {
	const target = args._.mainFile

	if (typeof target !== "string") {
		console.error("[BOOT] No main script provided")
		process.exit(1)
	}

	mainFile = target

	const rootPath = process.env.ROOT_PATH ?? process.cwd()
	const entryFile = path.resolve(mainFile)
	const __src = path.dirname(entryFile)

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

	// if --watch flag exist, start file watcher
	if (process.argv.includes("--watch")) {
		watcher = new Watcher(__src, { onReload: selfReloadDebounce })
		runFork()
	} else {
		runFork()
	}
}

export default command(
	{
		name: "boot",
		parameters: ["<main_file>"],
		flags: {
			watch: {
				type: Boolean,
				default: false,
				description: "Enables hot-reload for project changes",
			},
		},
	},
	boot,
)
