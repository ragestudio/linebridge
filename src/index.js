const path = require('path')

//* set globals
global.runtime = runtime
global.IS_DEV = runtime.helpers.isDevMode()
global.DEFAULT_RELIC_ORIGIN = require('./relicOrigin.json')
global.SERVER_VERSION = runtime.helpers.getVersion()
global.SERVER_MANIFEST = "server.manifest"
global.SERVER_MANIFEST_PATH = path.resolve(process.cwd(), SERVER_MANIFEST)

runtime.registerModulesAliases({
    "@classes": path.resolve(__dirname, 'classes'),
})

//* import libraries
const Classes = require('./classes')
const Server = require("./server")
const Client = require("./client")

//* export libraries
module.exports = { Server, Client, Classes }