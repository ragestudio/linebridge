import he from "hyper-express"
import rtengine from "../../classes/rtengine"

export default class Engine {
    constructor(params) {
        this.params = params
    }

    app = null
    router = null
    ws = null

    initialize = async (params) => {
        const serverParams = {
            max_body_length: 50 * 1024 * 1024, //50MB in bytes,
        }

        if (params.ssl) {
            serverParams.key_file_name = params.ssl?.key ?? null
            serverParams.cert_file_name = params.ssl?.cert ?? null
        }

        this.app = new he.Server(serverParams)

        this.router = new he.Router()

        // create a router map
        if (typeof this.router.map !== "object") {
            this.router.map = {}
        }

        await this.router.any("*", (req, res) => {
            return res.status(404).json({
                code: 404,
                message: "Not found"
            })
        })

        await this.app.use(async (req, res, next) => {
            if (req.method === "OPTIONS") {
                // handle cors
                if (params.ignoreCors) {
                    res.setHeader("Access-Control-Allow-Methods", "*")
                    res.setHeader("Access-Control-Allow-Origin", "*")
                    res.setHeader("Access-Control-Allow-Headers", "*")
                }

                return res.status(204).end()
            }

            // register body parser
            if (req.headers["content-type"]) {
                if (!req.headers["content-type"].startsWith("multipart/form-data")) {
                    req.body = await req.urlencoded()
                    req.body = await req.json(req.body)
                }
            }
        })

        if (params.enableWebsockets) {
            this.ws = global.websocket = new rtengine({
                ...params,
                handleAuth: params.handleWsAuth,
                root: `/${params.refName}`
            })

            this.ws.initialize()

            await this.ws.io.attachApp(this.app.uws_instance)
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

            if (params.enableWebsockets) {
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

    // close should be synchronous
    close = () => {
        if (this.ws) {
            this.ws.clear()

            if (typeof this.ws?.close === "function") {
                this.ws.close()
            }
        }

        if (typeof this.app?.close === "function") {
            this.app.close()
        }
    }
}