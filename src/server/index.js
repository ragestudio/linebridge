module.exports = {
    Server: require("./server.js"),
    Controller: require("./classes/controller"),
    Endpoint: require("./classes/endpoint"),
    registerBaseAliases: require("./registerAliases"),
    version: require("../../package.json").version,
}
