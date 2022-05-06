const io = require("socket.io-client")

class WSInterface {
    constructor(params = {}) {
        this.params = params
        this.manager = new io.Manager(this.params.origin, {
            autoConnect: false,
            transports: ["websocket"],
            ...this.params.managerOptions,
        })
        this.sockets = {}

        this.attach("/", "main", this.params.mainSocketOptions)
    }

    attach = (socket, as, options) => {
        if (typeof socket !== "string") {
            console.error("socket must be string")
            return false
        }

        socket = this.manager.socket(socket, options)

        return this.sockets[as ?? socket] = socket
    }

    detach = (socketName) => {
        if (typeof socketName !== "string") {
            console.error("socketName must be string")
            return false
        }
        if (typeof this.sockets[socketName] === "undefined") {
            console.error("socket not found")
            return false
        }

        if (this.sockets[socketName].connected) {
            this.sockets[socketName].disconnect()
        }

        delete this.sockets[socketName]
    }
}

module.exports = WSInterface