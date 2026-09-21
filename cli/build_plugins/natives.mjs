import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const nativeNodeModulesPlugin = {
	name: "native-node-modules",
	setup(build) {
		build.onResolve({ filter: /\.node$/ }, async (args) => {
			if (args.pluginData?.isResolvingNative) return

			const parsed = path.parse(args.path)

			const searchPaths = [
				path.join(
					parsed.dir,
					"build",
					"Release",
					`${parsed.name}-${os.arch()}${parsed.ext}`,
				),
				path.join(
					parsed.dir,
					"build",
					"Release",
					`${parsed.name}${parsed.ext}`,
				),
				args.path,
			]

			let finalResult = null

			for (const sPath of searchPaths) {
				const result = await build.resolve(sPath, {
					resolveDir: args.resolveDir,
					kind: args.kind,
					pluginData: { isResolvingNative: true },
				})

				if (result.errors.length === 0) {
					finalResult = result
					break
				}
			}

			if (!finalResult) {
				return { external: true }
			}

			const absolutePath = path.isAbsolute(finalResult.path)
				? finalResult.path
				: path.resolve(args.resolveDir, finalResult.path)

			return { path: absolutePath, namespace: "native-node-wrapper" }
		})

		build.onLoad(
			{ filter: /.*/, namespace: "native-node-wrapper" },
			(args) => {
				const fileVirtualPath = args.path + "?copy"

				const source = `
         import { createRequire } from 'node:module';
         import { fileURLToPath } from 'node:url';
         import { dirname, join } from 'node:path';

         import addonRelativePath from ${JSON.stringify(fileVirtualPath)};

         const require = createRequire(import.meta.url);
         const __dirname = dirname(fileURLToPath(import.meta.url));

         const absoluteAddonPath = join(__dirname, addonRelativePath);

         globalThis.__native_addons_cache = globalThis.__native_addons_cache || {};
         if (!globalThis.__native_addons_cache[absoluteAddonPath]) {
           globalThis.__native_addons_cache[absoluteAddonPath] = require(absoluteAddonPath);
         }

         export default globalThis.__native_addons_cache[absoluteAddonPath];
       `

				return { contents: source, resolveDir: path.dirname(args.path) }
			},
		)

		build.onResolve({ filter: /\.node\?copy$/ }, (args) => {
			return {
				path: args.path.replace(/\?copy$/, ""),
				namespace: "native-node-file",
			}
		})

		build.onLoad(
			{ filter: /.*/, namespace: "native-node-file" },
			async (args) => {
				const buffer = await fs.promises.readFile(args.path)

				return {
					contents: buffer,
					loader: "file",
					resolveDir: path.dirname(args.path),
				}
			},
		)
	},
}

export default nativeNodeModulesPlugin
