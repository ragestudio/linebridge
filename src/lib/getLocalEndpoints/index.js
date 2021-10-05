const fs = require("fs")
const path = require("path")

function getLocalEndpoints() {
    try {
        const localEndpointsFile = path.resolve(process.cwd(), `endpoints.json`)
        if (fs.existsSync(localEndpointsFile)) {
            return JSON.parse(fs.readFileSync(localEndpointsFile, 'utf-8'))
        }
        return false
    } catch (error) {
        return false
    }
}

module.exports = getLocalEndpoints