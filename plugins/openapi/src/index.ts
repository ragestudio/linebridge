import { Plugin } from "linebridge/src"

import generateOpenAPIJson from "./generateOpenAPIJson"
import loadSpecsFromRoutes from "./loadSpecsFromRoutes"

export const typeMap: Record<string, any> = {
	string: { type: "string" },
	number: { type: "number" },
	boolean: { type: "boolean" },
	date: { type: "string", format: "date-time" },
	String: { type: "string" },
	Number: { type: "number" },
	Boolean: { type: "boolean" },
	Date: { type: "string", format: "date-time" },
}

export class OpenAPIPlugin extends Plugin {
	spec: Record<string, any> = {}

	onRequest = async (req: any, res: any) => {
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

		this.spec = await generateOpenAPIJson(
			await loadSpecsFromRoutes(this.server.engine.registers),
		)

		this.server.register.http({
			method: "get",
			path: "/openapi.json",
			fn: this.onRequest,
		})
	}
}

export default OpenAPIPlugin
