import chokidar from "chokidar"
import { minimatch } from "minimatch"

const defaultIgnored = [
	"**/.cache/**",
	"**/node_modules/**",
	"**/dist/**",
	"**/build/**",
]

class Watcher {
	instance = null

	constructor(fromPath, { onReload }) {
		console.log("[WATCHER] Starting watching path >", fromPath)

		this.instance = chokidar.watch(fromPath, {
			ignored: (path) =>
				defaultIgnored.some((pattern) => minimatch(path, pattern)),
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: true,
		})

		this.instance.on("all", (event, filePath) => {
			console.log(`[WATCHER] Event [${event}] > ${filePath}`)

			if (typeof onReload === "function") {
				onReload()
			}
		})
	}
}

export default Watcher
