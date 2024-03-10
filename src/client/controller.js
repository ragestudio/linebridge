// TODO: AutoConnection
module.exports = class Controller {
    constructor(params = {}) {
        console.warn("[Linebridge] Controller is not finished yet. Please use regular bridges instead.")

        this.params = params
        this.pool = []
    }

    async initialize() {
        if (typeof this.params.servers !== "undefined" && Array.isArray(this.params.servers)) {
            for await (let server of this.params.servers) {
                await this.appendServer(server)
            }
        }

        for await (let server of this.pool) {
            await this.connect(server)
        }
    }

    async appendServer(server) {
        if (typeof server === "string") {
            server = new Bridge({
                origin: server,
            })
        } else if (typeof server === "object" && server instanceof Bridge) {
            server = new Bridge(...server)
        }

        this.pool.push(server)
    }

    // async disconnect() {
    // }

    async connect(server) {
        if (server instanceof Bridge) {
            await server.initialize()
        } else {
            throw new Error("Invalid server. Expected Bridge instance.")
        }
    }
}