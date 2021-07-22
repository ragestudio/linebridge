const axios = require("axios")
const { camalize } = require("@corenode/utils")
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

function generateDispatcher(bridge, method, route, getContext) {
    return async function (body, query, ...context) {
        let obj = Object()
        let opt = {
            parseData: true,
            method: method,
            url: route,
            data: body,
            params: query,
            ...context
        }

        if (typeof getContext === "function") {
            opt = { ...opt, ...getContext() }
        }

        const req = await bridge.instance(opt)

        if (opt.parseData) {
            obj = req.data
        }else {
            obj = req
        }

        return obj
    }
}

async function createInterface(address, getContext) {
    let objects = {
        get: Object(),
        post: Object(),
        put: Object(),
        delete: Object()
    }

    const bridge = new Bridge({
        origin: address
    })

    await bridge.connect()

    const routes = bridge.map.routes ?? []
    const methods = bridge.map.methods ?? {}

    if (Array.isArray(routes)) {
        routes.forEach((route) => {
            const method = methods[route].toLowerCase()
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

            objects[method][nameKey] = generateDispatcher(bridge, method, route, getContext)
        })
    }

    return objects
}

module.exports = {
    Bridge,
    createInterface,
}