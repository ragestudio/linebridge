import path from "node:path"
import type { ServerParams } from "./server"

declare const __dirname: string

const rootLibPath: string = path.resolve(__dirname, "../")
const libPkg = require(path.resolve(rootLibPath, "package.json"))
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
		listenPort: 3000,
		useEngine: "neo",
		websockets: false,
		nats: null,
		bypassCors: false,
		baseRoutes: true,
		routesPath: path.resolve(process.cwd(), "routes"),
		wsRoutesPath: path.resolve(process.cwd(), "ws_routes"),
		useMiddlewares: [],
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
	baseHeaders: {
		server: "linebridge",
		"lb-version": libPkg.version,
	},
	baseMiddlewares: {
		logs: require("./middlewares/logger").default,
	},
	fixedHttpMethods: {
		del: "delete",
	},
}

export default Vars
