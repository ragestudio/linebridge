const { Controller } = require("../../classes/controller")
const generateEndpointsFromDir = require("../generateEndpointsFromDir")

function generateControllerFromEndpointsDir(dir, controllerName) {
    const endpoints = generateEndpointsFromDir(dir)

    return class extends Controller {
        static refName = controllerName

        get = endpoints.get
        post = endpoints.post
        put = endpoints.put
        patch = endpoints.patch
        delete = endpoints.delete
    }
}

module.exports = generateControllerFromEndpointsDir