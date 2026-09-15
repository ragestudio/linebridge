/**
 * Centralized configuration and constants for the framework.
 *
 * Vars holds default server parameters, library metadata, base HTTP headers,
 * built-in middlewares, and HTTP method aliases (e.g. "del" → "delete").
 * These defaults are merged with user-provided params in the Server constructor.
 */
import type { ServerParams } from "./server"

import fs from "node:fs"
import path from "node:path"
import loggerMiddleware from "./middlewares/logger/index"
import corsMiddleware from "./middlewares/cors/index"

const LibPkg = JSON.parse(
	fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"),
)

class VarsInstance {
	rootLibPath: string = path.resolve(__dirname, "../")
	libPath: string = __dirname

	defaultParams: ServerParams = {
		refName: "linebridge",
		listenIp: "0.0.0.0",
		listenPort: process.env.LB_PORT ? parseInt(process.env.LB_PORT) : 3000,
		useEngine: "neo",
		websockets: false,
		nats: null,
		baseRoutes: true,
		routesPath: path.resolve(process.cwd(), "routes"),
		wsRoutesPath: path.resolve(process.cwd(), "ws_routes"),
		useMiddlewares: [],
		usePlugins: [],
		// All HTTP methods that the framework recognizes for route registration.
		httpMethods: [
			"get",
			"post",
			"put",
			"patch",
			"del",
			"delete",
			"trace",
			"head",
			"any",
			"options",
			"ws",
		],
	}
	baseHeaders: Record<string, string> = {
		server: "linebridge",
		"lb-version": LibPkg.version,
	}
	baseMiddlewares: Record<string, (...args: any[]) => void> = {
		logs: loggerMiddleware,
		cors: corsMiddleware,
	}
	fixedHttpMethods: Record<string, string> = {
		del: "delete",
	}

	libPkg: Record<string, any> = LibPkg
	projectPkg?: Record<string, any>
}

global.Vars = new VarsInstance()

declare global {
	var Vars: VarsInstance
}
