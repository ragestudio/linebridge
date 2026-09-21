import path from "node:path"
import fs from "node:fs"

export function scanForPath() {
	const paths = []

	if (process.env.ROOT_PATH) {
		paths.push(path.resolve(process.env.ROOT_PATH, ".env"))
	}

	paths.push(path.resolve(process.cwd(), ".env"))

	for (const p of paths) {
		if (fs.existsSync(p)) return p
	}
}

export function load() {
	const resolvedPath = scanForPath()

	if (resolvedPath) {
		process.loadEnvFile(resolvedPath)
	}
}

export default load
