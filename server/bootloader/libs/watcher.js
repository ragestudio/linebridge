const chokidar = require("chokidar")
const { minimatch } = require("minimatch")

const defaultIgnored = [
	"**/.cache/**",
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
]

class Watcher {
	static create = async (fromPath, { onReload }) => {
		console.log("[WATCHER] Starting watching path >", fromPath)

		global._watcher = chokidar.watch(fromPath, {
			ignored: (path) =>
				defaultIgnored.some((pattern) => minimatch(path, pattern)),
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: true,
		})

		global._watcher.on("all", (event, filePath) => {
			console.log(`[WATCHER] Event [${event}] > ${filePath}`)

			if (typeof onReload === "function") {
				onReload()
			}
		})
	}
}

module.exports = Watcher
