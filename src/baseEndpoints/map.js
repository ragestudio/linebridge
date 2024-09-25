import Endpoint from "../classes/endpoint"

export default class MainEndpoint extends Endpoint {
    route = "/_map"

    get = async (req, res) => {
        const httpMap = Object.entries(this.server.engine.router.map).reduce((acc, [route, { method, path }]) => {
            if (!acc[method]) {
                acc[method] = []
            }

            acc[method].push({
                route: path
            })

            return acc
        }, {})

        return res.json({
            http: httpMap,
            websocket: []
        })
    }
}