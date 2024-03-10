import { createServer } from "node:http"
import express from "express"
import socketio from "socket.io"
import rtengine from "../../classes/rtengine"

export default class Engine {
    constructor(params) {
        this.params = params
    }

    http = null
    app = null
    io = null
    ws = null

    router = express.Router()

    init = async (params) => {
        this.app = express()
        this.http = createServer(this.app)
        this.io = new socketio.Server(this.http)
        this.ws = new rtengine({
            ...params,
            io: this.io,
            http: false,
        })

        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: true }))
    }

    listen = async () => {
        await this.http.listen(this.params.listen_port)
    }
}