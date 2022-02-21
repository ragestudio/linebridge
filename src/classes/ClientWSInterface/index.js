import io from "socket.io-client"

module.exports = class WSInterface {
    constructor(params = {}) {
        this.params = params
        this.manager = new io.Manager(this.params.origin, {
            autoConnect: true,
            transports: ["websocket"],
            ...this.params.managerOptions,
        })
        this.sockets = {}

        this.register("/", "main")
    }

    register = (socket, as) => {
        if (typeof socket !== "string") {
            console.error("socket must be string")
            return false
        }

        socket = this.manager.socket(socket)
        return this.sockets[as ?? socket] = socket
    }
}