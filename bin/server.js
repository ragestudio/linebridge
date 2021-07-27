const cloudlink = require("../dist")
const random = require("corenode/dist/libs/random")

// create server
new cloudlink.Server({
    autoInit: true,
    id: runtime.args.id ?? random.generateName(),
})

new cloudlink.Client.createInterface("http://localhost:3010").then((client) => {
})