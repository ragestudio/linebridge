import type Server from "../server"

export default (server: Server): void => {
	server.headers["Access-Control-Allow-Origin"] = "*"
	server.headers["Access-Control-Allow-Methods"] = "*"
	server.headers["Access-Control-Allow-Headers"] = "*"
	server.headers["Access-Control-Allow-Credentials"] = "true"
}
