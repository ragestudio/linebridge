require("dotenv").config()
require("sucrase/register")

const path = require("node:path")
const Module = require("node:module")
const registerBaseAliases = require("./registerBaseAliases")

// Override file execution arg
process.argv.splice(1, 1)
process.argv[1] = path.resolve(process.argv[1])

// Expose to global
global.paths = {
	root: process.cwd(),
	__src: path.resolve(process.cwd(), path.dirname(process.argv[1])),
}

global["aliases"] = {
	// expose src
	"@": global.paths.__src,

	// expose shared resources
	"@db": path.resolve(process.cwd(), "db_models"),
	"@db_models": path.resolve(process.cwd(), "db_models"),
	"@shared-utils": path.resolve(process.cwd(), "utils"),
	"@shared-classes": path.resolve(process.cwd(), "classes"),
	"@shared-lib": path.resolve(process.cwd(), "lib"),
	"@shared-middlewares": path.resolve(process.cwd(), "middlewares"),

	// expose internal resources
	"@routes": path.resolve(paths.__src, "routes"),
	"@models": path.resolve(paths.__src, "models"),
	"@middlewares": path.resolve(paths.__src, "middlewares"),
	"@classes": path.resolve(paths.__src, "classes"),
	"@services": path.resolve(paths.__src, "services"),
	"@config": path.resolve(paths.__src, "config"),
	"@utils": path.resolve(paths.__src, "utils"),
	"@lib": path.resolve(paths.__src, "lib"),
}

// expose bootwrapper to global
global.Boot = require("./bootWrapper")

try {
	// apply patches
	require("./patches.js")

	// Apply aliases
	registerBaseAliases(global.paths.__src, global["aliases"])

	// execute main
	Module.runMain()
} catch (error) {
	console.error("[BOOT] ❌ Boot error: ", error)
}
