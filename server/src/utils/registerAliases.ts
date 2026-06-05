/**
 * @fileoverview Sets up module-alias shortcuts for the Linebridge project.
 *
 * Registers shorthand import aliases so that user code can use paths like
 * "@/controllers/user", "@middlewares/auth", "@utils/helper", etc., instead
 * of relative paths. The aliases point to either the dist/ or src/ directory
 * depending on whether the caller resides in a compiled build.
 *
 * Aliases registered:
 *   @              -> project src/dist
 *   @controllers   -> {project}/controllers
 *   @middlewares   -> {project}/middlewares
 *   @models        -> {project}/models
 *   @classes       -> {project}/classes
 *   @lib           -> {project}/lib
 *   @utils         -> {project}/utils
 */

import path from "node:path"
import moduleAlias from "module-alias"

/**
 * Registers module aliases pointing to the project's source or dist directory.
 * If the calling module's filename contains "dist", aliases point to dist/;
 * otherwise they point to src/. Custom additional aliases can be merged in.
 *
 * @param fromPath       - optional base path override (defaults to cwd/src or cwd/dist)
 * @param customAliases  - extra alias mappings to merge with the defaults
 */
export default (
	fromPath?: string,
	customAliases: Record<string, string> = {},
): void => {
	// auto-detect whether we are running from dist/ or src/
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
