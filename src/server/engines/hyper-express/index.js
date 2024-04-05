import he from "hyper-express"
import rtengine from "../../classes/rtengine"
import SocketIO from "socket.io"

export default class Engine {
    constructor(params) {
        this.params = params
    }

    app = new he.Server({
        max_body_length: 50 * 1024 * 1024, //50MB in bytes
    })

    router = new he.Router()

    io = null

    ws = null

    init = async (params) => {
        // register 404
        await this.router.any("*", (req, res) => {
            return res.status(404).json({
                code: 404,
                message: "Not found"
            })
        })

        await this.app.use(async (req, res, next) => {
            res.setHeader("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization")

            if (req.method === "OPTIONS") {
                return res.status(204).end()
            }

            if (req.headers["content-type"]) {
                if (!req.headers["content-type"].startsWith("multipart/form-data")) {
                    req.body = await req.urlencoded()
                    req.body = await req.json(req.body)
                }
            }
        })

        if (!params.disableWebSockets) {
            this.io = new SocketIO.Server({
                path: `/${params.refName}`,
            })

            this.io.attachApp(this.app.uws_instance)

            this.ws = global.rtengine = new rtengine({
                ...params,
                handleAuth: params.handleWsAuth,
                io: this.io,
            })
        }
    }

    listen = async (params) => {
        if (process.env.lb_service) {
            let pathOverrides = Object.keys(this.router.map).map((key) => {
                return key.split("/")[1]
            })

            // remove duplicates
            pathOverrides = [...new Set(pathOverrides)]

            // remove "" and _map
            pathOverrides = pathOverrides.filter((key) => {
                if (key === "" || key === "_map") {
                    return false
                }

                return true
            })

            if (!params.disableWebSockets) {
                process.send({
                    type: "router:ws:register",
                    id: process.env.lb_service.id,
                    index: process.env.lb_service.index,
                    data: {
                        namespace: params.refName,
                        listen: {
                            ip: this.params.listen_ip,
                            port: this.params.listen_port,
                        },
                    }
                })
            }

            if (process.send) {
                // try to send router map to host
                process.send({
                    type: "router:register",
                    id: process.env.lb_service.id,
                    index: process.env.lb_service.index,
                    data: {
                        router_map: this.router.map,
                        path_overrides: pathOverrides,
                        listen: {
                            ip: this.params.listen_ip,
                            port: this.params.listen_port,
                        },
                    }
                })
            }
        }

        await this.app.listen(this.params.listen_port)
    }

    close = async () => {
        if (this.io) {
            this.io.close()
        }

        await this.app.close()
    }
}