const axios = require("axios")
const camalize = require("@corenode/utils/dist/camalize")

export class RequestAdaptor {
    constructor(req, payload, callback) {
        this.callback = callback
        this.payload = payload
        this.req = req

        if (typeof this.req !== "function") {
            return this.cb("Invalid api request")
        }
        if (typeof this.payload === "undefined") {
            return this.cb("Payload not provided")
        }
    }

    send = async () => {
        let payloads = {
            body: undefined,
            query: undefined,
        }

        if (Array.isArray(this.payload)) {
            if (typeof this.payload[0] === "object") {
                payloads.body = this.payload[0]
            }
            if (typeof this.payload[1] === "object") {
                payloads.query = this.payload[1]
            }
        } else if (typeof this.payload === "object") {
            payloads = {
                ...payloads,
                ...this.payload
            }
        }

        return await this.req(payloads.body, payloads.query, { parseData: false })
            .then((res) => {
                this.cb(false, res)
                return res.data
            })
            .catch((err) => {
                this.cb(err.response.data, err.response)
                return err
            })
    }

    cb = (...context) => {
        if (typeof this.callback === "function") {
            this.callback(...context)
        }
    }
}

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
    return async function (body, query, options) {
        let obj = Object()
        let opt = {
            parseData: true,
            method: method,
            url: route,
            data: body,
            params: query,
            ...options
        }

        if (typeof getContext === "function") {
            opt = { ...opt, ...getContext() }
        }

        const req = await bridge.instance(opt)

        if (opt.parseData) {
            obj = req.data
        } else {
            obj = req
        }

        return obj
    }
}

async function createInterface(address, getContext) {
    let objects = {}

    const bridge = new Bridge({
        origin: address
    })

    await bridge.connect()

    const map = bridge.map

    Object.keys(map).forEach((method) => {
        method = method.toLowerCase()

        if (typeof objects[method] !== "object") {
            objects[method] = Object()
        }

        map[method].forEach((endpoint) => {
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

            objects[method][nameKey] = generateDispatcher(bridge, method, route, getContext)
        })

    })


    return objects
}

module.exports = {
    RequestAdaptor,
    Bridge,
    createInterface,
}