import { registerBaseAliases, Server } from "../../src/server"

registerBaseAliases()

const server = new Server({
    name: "example_server",
    listen_port: 3011,
},
    require("@controllers"),
    require("@middlewares"),
)

server.initialize()