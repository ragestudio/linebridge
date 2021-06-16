const tokenizer = require("../lib/tokenizer")
const path = require("path")
const fs = require("fs")

const SERVER_MANIFEST = global.SERVER_MANIFEST ?? "server.manifest"
const SERVER_MANIFEST_PATH = global.SERVER_MANIFEST_PATH ?? path.resolve(process.cwd(), SERVER_MANIFEST)

const serverfile = {
    stat: () => {
        return fs.lstatSync(SERVER_MANIFEST)
    },
    get: (key) => {
        let data = {}
        if (fs.existsSync(SERVER_MANIFEST)) {
            data = JSON.parse(fs.readFileSync(SERVER_MANIFEST_PATH, 'utf8'))
        }

        if (typeof key === "string") {
            return data[key]
        }
        return data
    },
    write: (mutation) => {
        let data = serverfile.get()
        data = { ...data, ...mutation }

        serverfile.data = data
        return fs.writeFileSync(SERVER_MANIFEST_PATH, JSON.stringify(data, null, 2), { encoding: "utf-8" })
    },
    create: () => {
        let data = {
            created: Date.now(),
            serverToken: tokenizer.generateOSKID()
        }

        serverfile.write(data)
    },
    file: SERVER_MANIFEST,
    filepath: SERVER_MANIFEST_PATH,
}

module.exports = serverfile