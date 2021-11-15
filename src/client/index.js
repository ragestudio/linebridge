const axios = require("axios")
const camalize = require("@corenode/utils/dist/camalize").default

const FixedMethods = {
    "del": "delete"
}

class Bridge {
    constructor(params = {}) {
        this.params = params

        this.origin = this.params.origin
        this.headers = { ...this.params.headers }

        this.instance = axios.create({
            baseURL: this.origin,
            headers: this.headers
        })

        this.map = null
        this.endpoints = {}

        return this
    }

    handleRequestContext = () => {
        if (typeof this.params.onRequestContext === "function") {
            return this.params.onRequestContext()
        }

        return false
    }

    initialize = async () => {
        this.map = await this.getMap()

        for await (let method of Object.keys(this.map)) {
            method = method.toLowerCase()

            const fixedMethod = FixedMethods[method] ?? method

            if (typeof this.endpoints[fixedMethod] !== "object") {
                this.endpoints[fixedMethod] = {}
            }

            this.map[method].forEach((endpoint) => {
                const route = endpoint.route
                const tree = route.split("/")
                const hasTree = tree.length >= 1
                let nameKey = route

                // check if has tree
                if (hasTree) {
                    // remove first whitespace item in route index[0]
                    if (tree[0] == "") {
                        tree.shift()
                    }

                    nameKey = camalize(tree.join("_"))
                }

                // if is an blank route, set as index
                if (nameKey == "") {
                    nameKey = "index"
                }

                this.endpoints[fixedMethod][nameKey] = generateDispatcher(this.instance, fixedMethod, route, this.handleRequestContext)
            })
        }

        return this.endpoints
    }

    getMap = async () => {
        const req = await this.instance.get("/map")
        return req.data
    }
}

function generateDispatcher(instance, method, route, handleRequestContext) {
    return function (body, query, options) {
        return new Promise(async (resolve, reject) => {
            let requestParams = {
                parseData: true,
                ...options,
                method: method,
                url: route,
                data: body,
                params: query,
            }

            if (typeof handleRequestContext === "function") {
                requestParams = { ...requestParams, ...handleRequestContext() }
            }

            let result = {
                response: null,
                error: null,
            }

            await instance(requestParams)
                .then((response) => {
                    result.response = response
                })
                .catch((error) => {
                    result.error = error.response.data.error ?? error.response.data
                })

            if (requestParams.parseData) {
                if (result.error) {
                    return reject(result.error)
                }

                return resolve(result.response.data)
            }

            return resolve(result)
        })
    }
}

module.exports = {
    Bridge,
}