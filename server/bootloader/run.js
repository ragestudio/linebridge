const path = require("node:path")
const childProcess = require("node:child_process")
const Watcher = require("./libs/watcher.js")

const bootloaderPath = path.resolve(__dirname, "boot.js")
const mainModulePath = process.argv[2]
const mainModuleSrc = path.resolve(process.cwd(), path.dirname(mainModulePath))

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
	})
}

// if --watch flag exist, start file watcher
if (process.argv.includes("--watch")) {
	Watcher.create(mainModuleSrc, {
		onReload: selfReloadDebounce,
	})
} else {
	require(bootloaderPath)
}
