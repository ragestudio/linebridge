const path = require("path")
const net = require("corenode/net")
const packageJSON = require(path.resolve(module.path, "../../package.json"))

// set globals variables
global.LINEBRIDGE_SERVER_VERSION = packageJSON.version

global.LOCALHOST_ADDRESS = net.ip.getHostAddress() ?? "localhost"

global.FIXED_HTTP_METHODS = {
    "del": "delete"
}

global.VALID_HTTP_METHODS = ["get", "post", "put", "patch", "del", "delete", "trace", "head", "any", "options", "ws"]

global.DEFAULT_HEADERS = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE, DEL",
    "Access-Control-Allow-Credentials": "true",
}

global.DEFAULT_SERVER_PARAMS = {
    urlencoded: true,
}

global.DEFAULT_MIDDLEWARES = [
    require('cors')({
        "origin": "*",
        "methods": DEFAULT_HEADERS["Access-Control-Allow-Methods"],
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    }),
]

if (process.env.NODE_ENV !== "production") {
    global.DEFAULT_MIDDLEWARES.push(require("morgan")("dev"))
}

module.exports = {
    Server: require("./server.js"),
    Controller: require("./classes/controller"),
}
