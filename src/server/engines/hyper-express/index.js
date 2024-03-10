import he from "hyper-express"

export default class Engine {
    constructor(params) {
        this.params = params
    }

    app = new he.Server()

    router = new he.Router()

    init = async (params) => {
        // register 404
        await this.router.any("*", (req, res) => {
            return res.status(404).json({
                code: 404,
                message: "Not found"
            })
        })

        // register body parser
        await this.app.use(async (req, res, next) => {
            req.body = await req.urlencoded()
        })
    }

    listen = async () => {
        await this.app.listen(this.params.listen_port)
    }
}