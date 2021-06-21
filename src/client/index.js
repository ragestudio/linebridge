const axios = require("axios")
const wsClient = require('websocket').client

const RELIC_ORIGIN = global.RELIC_ORIGIN


function resolveOrigin(origin) {

}

class Bridge {
    constructor(params) {
        this.params = params

        this.origin = this.params.origin
        this.headers = { ...this.params.headers }
        this.instance = axios.create({
            baseURL: this.origin,
            headers: this.headers
        })

        this.map = null
    }

    async connect() {
        //get map
        const req = await this.instance.get("/map")
        this.map = req.data
    }
}

function createInterface(address) {
    
    const bridge = new Bridge({
        origin: address
    })

    bridge.connect()
        .then(() => {
            console.log(bridge.map)
        })
}

module.exports = {
    Bridge,
    resolveOrigin,
    createInterface,
}