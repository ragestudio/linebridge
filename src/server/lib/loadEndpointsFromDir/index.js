const fs = require("node:fs")
const path = require("node:path")

function loadEndpointsFromDir(dir) {
    if (!dir) {
        throw new Error("No directory provided")
    }

    if (!fs.existsSync(dir)) {
        throw new Error(`Directory [${dir}] does not exist`)
    }

    // scan the directory for files
    const files = fs.readdirSync(dir)

    // create an object to store the endpoints
    const endpoints = {}

    // loop through the files
    for (const file of files) {
        // get the full path of the file
        const filePath = path.join(dir, file)

        // get the file stats
        const stats = fs.statSync(filePath)

        // if the file is a directory, recursively call this function
        if (stats.isDirectory()) {
            endpoints[file] = loadEndpointsFromDir(filePath)
        }

        // if the file is a javascript file, require it and add it to the endpoints object
        if (stats.isFile() && path.extname(filePath) === ".js") {
            endpoints[path.basename(file, ".js")] = require(filePath).default
        }
    }

    return endpoints
}

module.exports = loadEndpointsFromDir