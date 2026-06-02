import path from "node:path"
import moduleAlias from "module-alias"

export default (
	fromPath?: string,
	customAliases: Record<string, string> = {},
): void => {
	if (typeof fromPath === "undefined") {
		if ((module as any).parent.filename.includes("dist")) {
			fromPath = path.resolve(process.cwd(), "dist")
		} else {
			fromPath = path.resolve(process.cwd(), "src")
		}
	}

	// @ts-ignore
	moduleAlias.addAliases({
		...customAliases,
		"@": fromPath,
		"@controllers": path.resolve(fromPath, "controllers"),
		"@middlewares": path.resolve(fromPath, "middlewares"),
		"@models": path.resolve(fromPath, "models"),
		"@classes": path.resolve(fromPath, "classes"),
		"@lib": path.resolve(fromPath, "lib"),
		"@utils": path.resolve(fromPath, "utils"),
	})
}
