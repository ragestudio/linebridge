const fs = require("fs")
const path = require("path")

function fetchController(key) {
    try {
        const controllersPath = global.controllersPath ?? path.resolve(process.cwd(), `controllers`)
        const controllerPath = path.join(controllersPath, key)

        if (fs.existsSync(controllerPath)) {
            return require(controllerPath)
        }

    } catch (error) {
        runtime.logger.dump(error)
        console.error(`Failed to load controller [${key}] > ${error.message}`)
    }
}

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

module.exports = {
    fetchController,
    getLocalEndpoints
}