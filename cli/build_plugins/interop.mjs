const CJSInteropPlugin = {
	name: "cjs-interop",
	setup(build) {
		const virtualId = "virtual:cjs-interop"

		build.initialOptions.inject = build.initialOptions.inject || []
		build.initialOptions.inject.push(virtualId)

		build.onResolve({ filter: /^virtual:cjs-interop$/ }, () => {
			return { path: virtualId, namespace: "cjs-interop-ns" }
		})

		build.onLoad({ filter: /.*/, namespace: "cjs-interop-ns" }, () => {
			const contents = `
        import { createRequire } from 'node:module';
        import { fileURLToPath } from 'node:url';
        import { dirname } from 'node:path';

        export const require = createRequire(import.meta.url);
        export const __filename = fileURLToPath(import.meta.url);
        export const __dirname = dirname(__filename);
      `

			return { contents }
		})
	},
}

export default CJSInteropPlugin
