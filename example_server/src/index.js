import { registerBaseAliases, Server } from "../../src/server"

registerBaseAliases()

const server = new Server({
    listen_port: 3011,
},
    require("@controllers"),
    require("@middlewares"),
)

server.initialize()