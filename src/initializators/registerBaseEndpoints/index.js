import fs from "node:fs"
import path from "node:path"

export default async (server) => {
    const scanPath = path.join(__dirname, "../../", "baseEndpoints")
    const files = fs.readdirSync(scanPath)

    for await (const file of files) {
        if (file === "index.js") {
            continue
        }

        let endpoint = require(path.join(scanPath, file)).default

        new endpoint(server)
    }
}