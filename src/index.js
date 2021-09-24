const path = require('path')
const helpers = process.runtime.helpers ?? require('@corenode/helpers')

//* set globals
global.IS_DEV = helpers.isDevMode()
global.RELIC_ORIGIN = "https://relic.ragestudio.net"

global.SERVER_VERSION = helpers.getVersion()
global.SERVER_MANIFEST = "server.manifest"
global.SERVER_MANIFEST_PATH = path.resolve(process.cwd(), SERVER_MANIFEST)

//* import libraries
const Classes = require('./classes')
const Server = require("./server/http")
const WSServer = require("./server/websocket")
const Client = require("./client")

//* export libraries
module.exports = { Server, Client, Classes, WSServer}