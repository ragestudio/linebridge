module.exports = {
	Server: require("./server"),
	Route: require("./classes/Route"),
	registerBaseAliases: require("./utils/registerAliases"),
	version: require("../package.json").version,
}
