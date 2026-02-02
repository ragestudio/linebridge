const path = require("node:path")
const moduleAlias = require("module-alias")

class Aliases {
	static registerBase = (fromPath, customAliases = {}) => {
		if (typeof fromPath === "undefined") {
			if (module.parent.filename.includes("dist")) {
				fromPath = path.resolve(process.cwd(), "dist")
			} else {
				fromPath = path.resolve(process.cwd(), "src")
			}
		}

		moduleAlias.addAliases(customAliases)
	}
}

module.exports = Aliases
