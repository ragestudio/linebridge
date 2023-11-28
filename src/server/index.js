const path = require("path")
const net = require("corenode/net")

const packageJSON = require(path.resolve(module.path, "../../package.json"))
const moduleAlias = require("module-alias")

// set globals variables
global.LINEBRIDGE_SERVER_VERSION = packageJSON.version

global.LOCALHOST_ADDRESS = net.ip.getHostAddress() ?? "localhost"

global.FIXED_HTTP_METHODS = {
    "del": "delete"
}

global.VALID_HTTP_METHODS = [
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
    "ws"
]

global.DEFAULT_HEADERS = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE, DEL",
    "Access-Control-Allow-Credentials": "true",
}

global.DEFAULT_SERVER_PARAMS = {
    urlencoded: true,
    engine: "express",
    http_protocol: "http",
    ws_protocol: "ws",
}

global.DEFAULT_MIDDLEWARES = [
    require("cors")({
        "origin": "*",
        "methods": DEFAULT_HEADERS["Access-Control-Allow-Methods"],
        "preflightContinue": false,
        "optionsSuccessStatus": 204
    }),
]

if (process.env.LOG_REQUESTS === "true") {
    global.DEFAULT_MIDDLEWARES.push(require("morgan")(process.env.MORGAN_FORMAT ?? ":method :url :status - :response-time ms"))
}

// patches
const { Buffer } = require("buffer")

global.b64Decode = (data) => {
    return Buffer.from(data, "base64").toString("utf-8")
}
global.b64Encode = (data) => {
    return Buffer.from(data, "utf-8").toString("base64")
}

Array.prototype.updateFromObjectKeys = function (obj) {
    this.forEach((value, index) => {
        if (obj[value] !== undefined) {
            this[index] = obj[value]
        }
    })

    return this
}

global.toBoolean = (value) => {
    if (typeof value === "boolean") {
        return value
    }

    if (typeof value === "string") {
        return value.toLowerCase() === "true"
    }

    return false
}

function registerBaseAliases(fromPath, customAliases = {}) {
    if (typeof fromPath === "undefined") {
        if (module.parent.filename.includes("dist")) {
            fromPath = path.resolve(process.cwd(), "dist")
        } else {
            fromPath = path.resolve(process.cwd(), "src")
        }
    }

    moduleAlias.addAliases({
        ...customAliases,
        "@controllers": path.resolve(fromPath, "controllers"),
        "@middlewares": path.resolve(fromPath, "middlewares"),
        "@models": path.resolve(fromPath, "models"),
        "@classes": path.resolve(fromPath, "classes"),
        "@lib": path.resolve(fromPath, "lib"),
        "@utils": path.resolve(fromPath, "utils"),
    })
}

module.exports = {
    registerBaseAliases: registerBaseAliases,
    Server: require("./server.js"),
    Controller: require("./classes/controller"),
    Endpoint: require("./classes/endpoint"),
    version: require("../../package.json").version,
}
