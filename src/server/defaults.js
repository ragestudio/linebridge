const path = require("path")
const fs = require("fs")
const os = require("os")
const packageJSON = require(path.resolve(module.path, "../../package.json"))

function getHostAddress() {
    const interfaces = os.networkInterfaces()

    for (const key in interfaces) {
        const iface = interfaces[key]

        for (let index = 0; index < iface.length; index++) {
            const alias = iface[index]

            if (alias.family === "IPv4" && alias.address !== "127.0.0.1" && !alias.internal) {
                return alias.address
            }
        }
    }

    return "0.0.0.0"
}

export default {
    isExperimental: fs.existsSync(path.resolve(module.path, "../../.experimental")),
    version: packageJSON.version,
    localhost_address: getHostAddress() ?? "localhost",
    params: {
        urlencoded: true,
        engine: "express",
        http_protocol: "http",
        ws_protocol: "ws",
    },
    headers: {
        "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE, DEL",
        "Access-Control-Allow-Credentials": "true",
    },
    middlewares: {
        cors: require("./middlewares/cors").default,
        logs: require("./middlewares/logger").default,
    },
    useMiddlewares: [
        //"cors",
        "logs",
    ],
    controllers: [],
    fixed_http_methods: {
        "del": "delete",
    },
    valid_http_methods: [
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
}