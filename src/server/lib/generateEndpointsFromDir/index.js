const loadEndpointsFromDir = require("../loadEndpointsFromDir")

function generateEndpointsFromDir(dir) {
    const loadedEndpoints = loadEndpointsFromDir(dir)

    // filter by methods
    const endpointsByMethods = Object()

    for (const endpointKey in loadedEndpoints) {
        const endpoint = loadedEndpoints[endpointKey]
        const method = endpoint.method.toLowerCase()

        if (!endpointsByMethods[method]) {
            endpointsByMethods[method] = {}
        }

        endpointsByMethods[method][endpoint.route] = loadedEndpoints[endpointKey]
    }

    return endpointsByMethods
}

module.exports = generateEndpointsFromDir