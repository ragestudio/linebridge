const http = require('http')
const socketIo = require('socket.io')

class WSServer {
    constructor(params) {

        this.params = { ...params }
        this.io = socketIo({
            serveClient: false,
        })

        this.sockets = {}
        this.namespaces = {}

        this.listenPort = this.params.listenPort ?? 3005
        this.httpServer = http.createServer()

        this.io.on('connection', (socket) => {
            console.log(`New connection => ${socket.id}`)

            this.sockets[socket.id] = socket

            socket.on("disconnect", (reason) => {
                console.log(`Disconnect => ${socket.id} [${reason}]`)
                delete this.sockets[socket.id]
            })
        })

        this.init()
    }

    init() {
        if (typeof this.params.namespaces !== "undefined") {
            if (Array.isArray(this.params.namespaces)) {
                this.params.namespaces.forEach((namespace) => {
                    this.attachNamespace(namespace)
                })
            }
        }

        this.io.attach(this.httpServer, {
            pingInterval: 10000,
            pingTimeout: 5000,
            cookie: false
        })

        this.httpServer.listen(this.listenPort)
        console.log("WSS Listen on " + this.listenPort)
    }

    attachNamespace = (namespace) => {
        this.namespaces[namespace] = this.io.of(`/${namespace}`)

        return this.namespaces[namespace]
    }

}

module.exports = WSServer