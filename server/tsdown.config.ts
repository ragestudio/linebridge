import { defineConfig } from "tsdown"

export default defineConfig([
	{
		entry: ["src/index.ts", "src/server.ts", "src/global.js"],
		outDir: "./build/dist",
		format: "cjs",
		platform: "node",
		dts: true,
		clean: true,
		sourcemap: false,
		unbundle: true,
		treeshake: true,
		outExtensions({ format, pkgType }) {
			return {
				js: ".js",
				dts: ".d.ts",
			}
		},
		minify: {
			mangle: {
				keepNames: true,
			},
		},
	},
])
