/**
 * Centralized configuration and constants for the framework.
 *
 * Vars holds default server parameters, library metadata, base HTTP headers,
 * built-in middlewares, and HTTP method aliases (e.g. "del" → "delete").
 * These defaults are merged with user-provided params in the Server constructor.
 */
import path from "node:path"
import type { ServerParams } from "./server"

declare const __dirname: string

// Root of the linebridge library installation (one level above this file).
const rootLibPath: string = path.resolve(__dirname, "../")

// Package metadata for the library itself.
const libPkg = require(path.resolve(rootLibPath, "package.json"))

// Package metadata for the user's project (process.cwd()).
const projectPkg = require(path.resolve(process.cwd(), "package.json"))

export interface VarsType {
	rootLibPath: string
	libPath: string
	libPkg: any
	projectPkg: any
	defaultParams: ServerParams
	baseHeaders: Record<string, string>
	baseMiddlewares: Record<string, (...args: any[]) => void>
	fixedHttpMethods: Record<string, string>
}

const Vars: VarsType = {
	rootLibPath,
	libPath: __dirname,
	libPkg,
	projectPkg,
	defaultParams: {
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
	},
	// Headers sent with every response by default.
	baseHeaders: {
		server: "linebridge",
		"lb-version": libPkg.version,
	},
	// Built-in middlewares registered by name.
	baseMiddlewares: {
		logs: require("./middlewares/logger").default,
		cors: require("./middlewares/cors").default,
	},
	// Aliases for HTTP method names (e.g. "del" normalizes to "delete").
	fixedHttpMethods: {
		del: "delete",
	},
}

export default Vars
