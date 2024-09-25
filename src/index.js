module.exports = {
    Server: require("./server.js"),
    Endpoint: require("./classes/endpoint"),
    registerBaseAliases: require("./registerAliases"),
    version: require("../package.json").version,
}
