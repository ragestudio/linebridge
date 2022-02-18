const generateRequestDispatcher = require("./generateRequestDispatcher")
const axios = require("axios")
const camalize = require("@corenode/utils/dist/camalize").default

const FixedMethods = {
    "del": "delete"
}

module.exports = class Bridge {
    constructor(params = {}) {
        this.params = params

        this.origin = this.params.origin
        this.headers = { ...this.params.headers }

        this.instance = axios.create({
            baseURL: this.origin,
            headers: this.headers
        })

        this.endpoints = {}

        return this
    }

    initialize = async () => {
        await this.updateEndpointsMap()
    }

    handleRequestContext = async () => {
        if (typeof this.params.onRequest === "function") {
            return await this.params.onRequest()
        }

        return false
    }

    handleResponse = async (response) => {
        if (typeof this.params.onResponse === "function") {
            return await this.params.onResponse(response)
        }

        return false
    }

    updateEndpointsMap = async () => {
        const endpointsMap = await this.instance.get("/")
            .then(res => res.data.endpointsMap)
            .catch(err => {
                console.error(err)
                throw new Error(`Could not get endpoints map from server. [${err.message}]`)
            })

        for await (let HttpMethod of Object.keys(endpointsMap)) {
            HttpMethod = HttpMethod.toLowerCase()

            const fixedMethod = FixedMethods[HttpMethod] ?? HttpMethod

            if (typeof this.endpoints[fixedMethod] !== "object") {
                this.endpoints[fixedMethod] = {}
            }

            Object.keys(endpointsMap[HttpMethod]).forEach((route) => {
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

                this.endpoints[fixedMethod][nameKey] = generateRequestDispatcher(
                    this.instance,
                    fixedMethod,
                    route,
                    this.handleRequestContext,
                    this.handleResponse
                )
            })
        }

        return this.endpoints
    }
}