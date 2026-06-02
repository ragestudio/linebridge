import { defineConfig } from "tsdown"

export default defineConfig([
	{
		entry: ["src/index.ts", "src/server.ts"],
		outDir: "./build/dist",
		target: "node24",
		format: "commonjs",
		platform: "node",
		dts: {
			cjsReexport: true,
		},
		clean: true,
		cjsDefault: false,
		sourcemap: false,
		unbundle: true,
		treeshake: false,
		outExtensions({ format, pkgType }) {
			return {
				js: ".js",
				dts: ".d.ts",
			}
		},
		minify: {
			mangle: false,
		},
	},
])
