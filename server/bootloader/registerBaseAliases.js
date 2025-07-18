const path = require("node:path")
const moduleAlias = require("module-alias")

module.exports = function registerBaseAliases(fromPath, customAliases = {}) {
	if (typeof fromPath === "undefined") {
		if (module.parent.filename.includes("dist")) {
			fromPath = path.resolve(process.cwd(), "dist")
		} else {
			fromPath = path.resolve(process.cwd(), "src")
		}
	}

	moduleAlias.addAliases(customAliases)
}
