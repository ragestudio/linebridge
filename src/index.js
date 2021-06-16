const path = require('path')

//* set globals
global.IS_DEV = runtime.helpers.isDevMode()
global.SERVER_VERSION = runtime.helpers.getVersion()
global.SERVER_MANIFEST = "server.manifest"
global.SERVER_MANIFEST_PATH = path.resolve(process.cwd(), SERVER_MANIFEST)

//* import libraries
const classes = require('./classes')
const Server = require("./server")

//* export libraries
module.exports = { Server, ...classes }