import path from "node:path"

import Endpoint from "../classes/endpoint"
import defaults from "../defaults"

const projectPkg = require(path.resolve(process.cwd(), "package.json"))

export default class MainEndpoint extends Endpoint {
    route = "/"

    get = async (req, res) => {
        const { params } = this.ctx

        return {
            name: params.name ?? "unknown",
            version: projectPkg.version ?? "unknown",
            engine: params.useEngine ?? "unknown",
            request_time: new Date().getTime(),
            lb_version: defaults.version ?? "unknown",
            experimental: defaults.isExperimental.toString() ?? "unknown",
        }
    }
}