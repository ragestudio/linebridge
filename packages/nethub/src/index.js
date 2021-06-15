const express = require("express")
const os = require('os')
const path = require('path')
const fs = require('fs')

//* LIBS
const { objectToArrayMap } = require("@corenode/utils")
const TOKENIZER = require("./lib/tokenizer")

//* GLOBALS
const SERVER_REGISTRY = "server.registry"
const SERVER_GENFILE = "origin.server"

const SERVER_REGISTRYPATH = path.resolve(process.cwd(), SERVER_REGISTRY)
const SERVER_GENFILEPATH = path.resolve(process.cwd(), SERVER_GENFILE)

const SERVER_VERSION = global.SERVER_VERSION = runtime.helpers.getVersion()
const SERVER = require("express")()

//* SERVER HUB REGISTRY
const HUB = {
    entries: [],
    oids: [],
    registry: {},
    set: (oid, data) => {
        HUB.registry[oid] = data

        HUB.update()
    },
    del: (oid) => {
        const addressIndex = HUB.oids.indexOf(oid)

        delete HUB.registry[oid]
        delete HUB.oids[addressIndex]
        delete HUB.entries[addressIndex]

        HUB.update()
    },
    update: () => {
        const data = {
            entries: HUB.entries,
            oids: HUB.oids,
            registry: HUB.registry,
        }
        return fs.writeFileSync(SERVER_REGISTRYPATH, JSON.stringify(data, null, 2), { encoding: "utf-8" })
    },
    read: () => {
        if (fs.existsSync(SERVER_REGISTRYPATH)) {
            const data = JSON.parse(fs.readFileSync(SERVER_REGISTRYPATH, 'utf8')) ?? {}

            HUB.entries = data.entries
            HUB.oids = data.oids
            HUB.registry = data.registry
        }
    }
}

//* SERVER GEN 
const GEN = {
    stat: () => {
        return fs.lstatSync(SERVER_GENFILEPATH)
    },
    get: (key) => {
        if (fs.existsSync(SERVER_GENFILEPATH)) {
            return JSON.parse(fs.readFileSync(SERVER_GENFILEPATH, 'utf8')) ?? {}
        }
        return {}
    },
    write: (mutation) => {
        let data = GEN.get()
        data = { ...data, ...mutation }

        GEN.data = data
        return fs.writeFileSync(SERVER_GENFILEPATH, JSON.stringify(data, null, 2), { encoding: "utf-8" })
    },
    create: () => {
        let data = {
            created: Date.now(),
            serverToken: TOKENIZER.generate()
        }

        GEN.write(data)
    },
    file: SERVER_GENFILE,
    filepath: SERVER_GENFILEPATH,
}

//* DEFAULTS
const DEFAULT_MIDDLEWARES = [
    require('cors')(),
    require('morgan')("dev")
]
const DEFAULT_HEADERS = {
    "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    "Access-Control-Allow-Credentials": "true",
}
const DEFAULT_PORT = process.parsedArgs.listenPort ?? 1010

//* HELPERS
function getUptime() {
    const { lastStart } = global.GENDATA
    const now = Date.now()

    return now - lastStart
}
function getRegistryFromEntry(entry){
    const index = HUB.entries.indexOf(entry)
    const oid = HUB.oids[index]

    return HUB.registry[oid]
}

//* GLOBAL FUNCTIONS
function init() {
    //? check if origin.server exists
    if (!fs.existsSync(SERVER_GENFILEPATH)) {
        GEN.create()
    }

    //? check origin.server integrity
    const GENDATA = global.GENDATA = GEN.get()
    const GENSTAT = global.GENSTAT = GEN.stat()

    if (typeof GENDATA.created === "undefined") {
        console.warn("Server generation file not contains an creation date")
        GEN.write({ created: Date.parse(GENSTAT.birthtime) })
    }

    if (typeof GENDATA.serverToken === "undefined") {
        console.warn("Missing server token!")
        GEN.create()
    }

    //? set last start
    GEN.write({ lastStart: Date.now() })

    //? read registry
    HUB.read()

    //? continue starting server
    start()
}

function start() {
    //? set middlewares
    SERVER.use(express.json())
    SERVER.use(express.urlencoded({ extended: true }))
    SERVER.use((req, res, next) => {
        objectToArrayMap(DEFAULT_HEADERS).forEach((entry) => {
            res.setHeader(entry.key, entry.value)
        })

        next()
    })
    DEFAULT_MIDDLEWARES.forEach((middleware) => {
        SERVER.use(middleware)
    })

    //? set routes
    SERVER.get("/", (req, res, next) => {
        res.json({
            uptime: getUptime(),
            created: global.GENDATA.created,
            time: new Date().getTime(),
            originID: `${os.hostname()}`,
            version: SERVER_VERSION
        })
    })

    // TODO: set websocket server heap & events
    SERVER.get("/heartbeat", (req, res, next) => {
        res.json({
            uptime: getUptime()
        })
    })

    SERVER.put("/registry", (req, res, next) => {
        let { entry, oid } = req.body
        const address = req.headers['x-real-ip'] || req.connection.remoteAddress

        let mutation = {}

        //? validate oid token
        if (typeof oid !== "undefined") {
            if (!TOKENIZER.valid(oid)) {
                res.status(403)
                return res.json({
                    error: `[${oid}] Is an invalid OID!`
                })
            }
        }

        if (typeof HUB.registry[oid] !== "undefined") {
            mutation = HUB.registry[oid]

            //? check if is allowed
            if (HUB.registry[oid]?.address !== address) {
                res.status(403)
                return res.json({
                    error: `[${oid}] is already registered, is not allowed to override registry with this current address (${address})`
                })
            }

            mutation.lastUpdated = Date.now()
        } else {
            //? check duplications
            if (HUB.entries.includes(entry)) {
                const duplicate = getRegistryFromEntry(entry)

                res.status(409)
                return res.json({
                    error: `[${entry}] This entry has been already registered, with oid [${duplicate.oid}]`
                })
            }

            if (typeof oid === "undefined") {
                oid = TOKENIZER.generate(address)
            }

            HUB.entries.push(entry)
            HUB.oids.push(oid)

            mutation.oid = oid
            mutation.created = Date.now()
        }

        mutation["address"] = address
        mutation["entry"] = entry

        //? successfully
        HUB.set(oid, mutation)
        res.json({
            ...HUB.registry[oid],
            originToken: global.GENDATA.serverToken
        })
    })

    SERVER.get("/registry", (req, res, next) => {
        const { oid } = req.query
        const address = req.headers['x-real-ip'] || req.connection.remoteAddress

        if (typeof HUB.registry[oid] === "undefined") {
            res.status(404)
            return res.json({
                error: `[${oid}] Not founded in this hub!`
            })
        }

        res.json(HUB.registry[oid])
    })

    SERVER.delete("/registry", (req, res, next) => {
        const { oid } = req.query
        const address = req.headers['x-real-ip'] || req.connection.remoteAddress

        if (typeof HUB.registry[oid] === "undefined") {
            res.status(404)
            return res.json({
                error: `[${oid}] Not founded in this hub!`
            })
        }

        if (HUB.registry[oid]?.address !== address) {
            res.status(403)
            return res.json({
                error: `[${oid}] Is not allowed to delete this registry with this current address (${address})`
            })
        }

        HUB.del(oid)

        res.json({
            oid
        })
    })

    //? set to listen
    SERVER.listen(DEFAULT_PORT, () => {
        console.log(`✅  Ready on port ${DEFAULT_PORT}!`)
    })
}

//? start server
init()