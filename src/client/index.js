const Controller = require("./controller")
const Bridge = require("./bridge")

module.exports = {
    Bridge,
    Controller,
    version: require("../../package.json").version,
}