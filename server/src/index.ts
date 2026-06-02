import Server from "./server"
import Route from "./classes/Route"
import registerBaseAliases from "./utils/registerAliases"

const version: string = require("../package.json").version

export { Server, Route, registerBaseAliases, version }
