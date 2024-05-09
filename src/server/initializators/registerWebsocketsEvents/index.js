import fs from "node:fs"

import RecursiveRegister from "../../lib/recursiveRegister"

export default async (startDir, engine) => {
    if (!engine.ws) {
        return engine
    }

    if (!fs.existsSync(startDir)) {
        return engine
    }

    await RecursiveRegister({
        start: startDir,
        match: async (filePath) => {
            return filePath.endsWith(".js") || filePath.endsWith(".ts")
        },
        onMatch: async ({ absolutePath, relativePath }) => {
            let eventName = relativePath.split("/").join(":")

            eventName = eventName.replace(".js", "")
            eventName = eventName.replace(".ts", "")

            let fn = require(absolutePath)

            fn = fn.default ?? fn

            console.log(`[WEBSOCKET] register event : ${eventName} >`, fn)

            engine.ws.events.set(eventName, fn)
        }
    })

    return engine
}