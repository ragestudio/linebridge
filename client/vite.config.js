import { dirname, resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
	build: {
		target: "esnext",
		lib: {
			entry: [resolve(import.meta.dirname, "src/index.js")],
			name: "linebridge-client",
			fileName: "index",
		},
	},
})
