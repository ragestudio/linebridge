require("dotenv").config({
	quiet: true,
})

const path = require("node:path")
const Module = require("node:module")
const Aliases = require("./libs/aliases.js")

// Override file execution arg
process.argv.splice(1, 1)
process.argv[1] = path.resolve(process.argv[1])

// Expose to global
global["paths"] = {
	root: process.env.ROOT_PATH ?? process.cwd(),
	__src: path.resolve(
		process.env.ROOT_PATH ?? process.cwd(),
		path.dirname(process.argv[1]),
	),
}

global["aliases"] = {
	// expose src
	"@": global.paths.__src,

	// expose shared resources
	"@db": path.resolve(global.paths.root, "db"),
	"@db_models": path.resolve(global.paths.root, "db_models"),
	"@shared-classes": path.resolve(global.paths.root, "classes"),
	"@shared-middlewares": path.resolve(global.paths.root, "middlewares"),
	"@shared-utils": path.resolve(global.paths.root, "utils"),
	"@shared-lib": path.resolve(global.paths.root, "lib"),

	// expose internal resources
	"@classes": path.resolve(global.paths.__src, "classes"),
	"@middlewares": path.resolve(global.paths.__src, "middlewares"),
	"@routes": path.resolve(global.paths.__src, "routes"),
	"@models": path.resolve(global.paths.__src, "models"),
	"@config": path.resolve(global.paths.__src, "config"),
	"@utils": path.resolve(global.paths.__src, "utils"),
	"@lib": path.resolve(global.paths.__src, "lib"),
}

try {
	// try to read the package.json
	const packageJson = require(path.resolve(global.paths.root, "package.json"))

	if (packageJson) {
		if (typeof packageJson.aliases === "object") {
			for (const [key, value] of Object.entries(packageJson.aliases)) {
				global["aliases"][key] = path.resolve(global.paths.root, value)
			}
		}
	}

	// apply global functions & patches
	require("./globals.js")
	// use sucrase transcompiler
	require("sucrase/register")

	// Apply aliases
	Aliases.registerBase(global.paths.__src, global["aliases"])

	// execute main
	Module.runMain()
} catch (error) {
	console.error("[BOOT] ❌ Boot error: ", error)
}
