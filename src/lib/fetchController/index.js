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

module.exports = fetchController