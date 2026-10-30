import { Plugin } from "linebridge"

import generateOpenAPIJson from "./generateOpenAPIJson"
import loadSpecsFromRoutes from "./loadSpecsFromRoutes"

export { typeMap } from "./typeMap"

export class OpenAPIPlugin extends Plugin {
	spec: Record<string, any> = {}

	private specGenerated = false

	onRequest = async (req: any, res: any) => {
		// Routes are registered AFTER plugins initialize, so the spec must be
		// generated lazily on first request, when engine.registers is populated.
		if (!this.specGenerated) {
			this.specGenerated = true

			this.spec = await generateOpenAPIJson(
				await loadSpecsFromRoutes(this.server.engine.registers),
			)
		}

		const protocol = this.server.hasSSL ? "https" : "http"

		let serverUrl: string = ""

		if (req.headers && req.headers["host"]) {
			serverUrl = `${protocol}://${req.headers["host"]}`
		} else {
			const host =
				this.server.params.listenIp === "0.0.0.0"
					? "localhost"
					: this.server.params.listenIp
			const port = this.server.params.listenPort
			serverUrl = `${protocol}://${host}:${port}`
		}

		return {
			...this.spec,
			servers: [{ url: serverUrl }],
		}
	}

	initialize = async () => {
		if (this.server.params.useEngine !== "neo") {
			console.error(
				"[OpenAPIPlugin] Unsupported engine, skipping initialization. \n Only 'neo' engine is supported.",
			)
			return
		}

		console.log("[OpenAPIPlugin] Initializing...")

		this.server.register({
			method: "get",
			path: "/openapi.json",
			fn: this.onRequest,
		})
	}
}

export default OpenAPIPlugin
