import path from "node:path"

const rootLibPath = path.resolve(__dirname, "../")
const packageJSON = require(rootLibPath, "../package.json")
const projectPkg = require(path.resolve(process.cwd(), "package.json"))

export default {
	libPath: __dirname,
	rootLibPath: rootLibPath,
	libPkg: packageJSON,
	projectCwd: process.cwd(),
	projectPkg: projectPkg,
	defaultParams: {
		refName: "linebridge",
		listenIp: "0.0.0.0",
		listenPort: 3000,
		useEngine: "he",
		websockets: false,
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
		"lb-version": packageJSON.version,
	},
	baseMiddlewares: {
		logs: require("./middlewares/logger").default,
	},
	fixedHttpMethods: {
		del: "delete",
	},
}
