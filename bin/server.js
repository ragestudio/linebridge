const cloudlink = require("../dist")
const random = require("corenode/dist/libs/random")

// create server
const server = new cloudlink.Server({
    autoInit: true,
    id: runtime.args.id ?? random.generateName()
})

// connect
const client = cloudlink.Client.createInterface(server.localOrigin)