module.exports = {
	Server: require("./server"),
	Route: require("./classes/Route"),
	registerBaseAliases: require("./registerAliases"),
	version: require("../package.json").version,
}
