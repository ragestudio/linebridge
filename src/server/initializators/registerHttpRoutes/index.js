import fs from "node:fs"

import Endpoint from "../../classes/endpoint"
import RecursiveRegister from "../../lib/recursiveRegister"

const parametersRegex = /\[([a-zA-Z0-9_]+)\]/g

export default async (startDir, engine, ctx) => {
    if (!fs.existsSync(startDir)) {
        return engine
    }

    await RecursiveRegister({
        start: startDir,
        match: async (filePath) => {
            return filePath.endsWith(".js") || filePath.endsWith(".ts")
        },
        onMatch: async ({ absolutePath, relativePath }) => {
            const paths = relativePath.split("/")

            let method = paths[paths.length - 1].split(".")[0].toLocaleLowerCase()
            let route = paths.slice(0, paths.length - 1).join("/")

            // parse parametrized routes
            route = route.replace(parametersRegex, ":$1")
            route = route.replace("[$]", "*")

            // clean up
            route = route.replace(".js", "")
            route = route.replace(".ts", "")

            // check if route ends with index
            if (route.endsWith("/index")) {
                route = route.replace("/index", "")
            }

            // add leading slash
            route = `/${route}`

            // import route
            let fn = require(absolutePath)

            fn = fn.default ?? fn

            if (typeof fn !== "function") {
                if (!fn.fn) {
                    console.warn(`Missing fn handler in [${method}][${route}]`)
                    return false
                }

                if (Array.isArray(fn.useContext)) {
                    let contexts = {}

                    for (const context of fn.useContext) {
                        contexts[context] = ctx.contexts[context]
                    }

                    fn.contexts = contexts

                    fn.fn.bind({ contexts })
                }
            }

            new Endpoint(
                ctx,
                {
                    route: route,
                    enabled: true,
                    middlewares: fn.middlewares,
                    handlers: {
                        [method]: fn.fn ?? fn,
                    }
                }
            )
        }
    })

    return engine
}