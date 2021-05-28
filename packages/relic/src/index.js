const axios = require("axios")
const wsClient = require('websocket').client

console.log(module)

const defaultRelicOrigin = module._require("./defaultOrigin.json")


let sockets = {}

function registerNewBridge() {

}

function resolveOrigin(origin) {
    
}

function connectToOrigin(origin) {
    if (typeof origin === "undefined") {
        origin = defaultRelicOrigin
    }
    return new DefaultBridge({
        origin: origin
    })
}

class DefaultBridge {
    constructor(params) {
        this.params = params
        
        this.origin = this.params.origin ?? "https://relic.ragestudio.net"
    }
}

module.exports = {
    defaultRelicOrigin,
    registerNewBridge,
    resolveOrigin,
    connectToOrigin
}