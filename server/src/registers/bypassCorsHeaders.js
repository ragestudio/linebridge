export default (server) => {
	server.headers["Access-Control-Allow-Origin"] = "*"
	server.headers["Access-Control-Allow-Methods"] = "*"
	server.headers["Access-Control-Allow-Headers"] = "*"
	server.headers["Access-Control-Allow-Credentials"] = "true"
}
