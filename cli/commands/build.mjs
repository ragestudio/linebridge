import * as esbuild from "esbuild"
import path from "node:path"
import { minimatch } from "minimatch"

import NativesBuildPlugin from "../build_plugins/natives.mjs"
import InteropBuildPlugin from "../build_plugins/interop.mjs"
import { command } from "cleye"

const excluded = ["dist", "node_modules"]

// NOT IMPLEMENTED YET
export async function build({ mainFile }) {
	const sourcePath = path.dirname(path.resolve(process.cwd(), mainFile))
	const excludedPaths = excluded.map((p) => path.resolve(sourcePath, p))

	const buildRes = await esbuild.build({
		bundle: true,
		entryPoints: [],
		outdir: "./dist",

		target: "node24",
		platform: "node",
		format: "esm",

		packages: "bundle",
		sourcemap: true,
		preserveSymlinks: false,
		treeShaking: true,

		splitting: true,
		minify: false,
		minifyWhitespace: false,

		define: {
			"process.env.IS_BUNDLED": "true",
		},
		plugins: [NativesBuildPlugin, InteropBuildPlugin],

		banner: {
			js: `
    import { createRequire as __createRequire } from "node:module";
    import { fileURLToPath as __fileURLToPath } from "node:url";
    import { dirname as __dirnamePath } from "node:path";
    globalThis.require = globalThis.require || __createRequire(import.meta.url);
    globalThis.__filename = globalThis.__filename || __fileURLToPath(import.meta.url);
    globalThis.__dirname = globalThis.__dirname || __dirnamePath(globalThis.__filename);
			`.trim(),
		},
	})

	console.log(buildRes)

	return buildRes
}

export default command(
	{
		name: "build",
		parameters: ["<main_file>"],
	},
	build,
)
