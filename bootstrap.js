require("dotenv").config()

const path = require("path")
const { webcrypto: crypto } = require("crypto")
const infisical = require("infisical-node")

const { registerBaseAliases } = require("./dist/server")
const EventEmitter = require("./dist/lib/event_emitter").default

global.isProduction = process.env.NODE_ENV === "production"

globalThis["__root"] = path.resolve(process.cwd())
globalThis["__src"] = path.resolve(globalThis["__root"], global.isProduction ? "dist" : "src")

const customAliases = {
    "root": globalThis["__root"],
    "src": globalThis["__src"],
    "@shared-classes": path.resolve(globalThis["__src"], "_shared/classes"),
    "@services": path.resolve(globalThis["__src"], "services"),
}

if (!global.isProduction) {
    customAliases["comty.js"] = path.resolve(globalThis["__src"], "../../comty.js/src")
    customAliases["@shared-classes"] = path.resolve(globalThis["__src"], "shared-classes")
}

if (process.env.USE_LINKED_SHARED) {
    customAliases["@shared-classes"] = path.resolve(globalThis["__src"], "shared-classes")
}

registerBaseAliases(globalThis["__src"], customAliases)

// patches
const { Buffer } = require("buffer")

global.b64Decode = (data) => {
    return Buffer.from(data, "base64").toString("utf-8")
}
global.b64Encode = (data) => {
    return Buffer.from(data, "utf-8").toString("base64")
}

global.nanoid = (t = 21) => crypto.getRandomValues(new Uint8Array(t)).reduce(((t, e) => t += (e &= 63) < 36 ? e.toString(36) : e < 62 ? (e - 26).toString(36).toUpperCase() : e > 62 ? "-" : "_"), "");

global.eventBus = new EventEmitter()

Array.prototype.updateFromObjectKeys = function (obj) {
    this.forEach((value, index) => {
        if (obj[value] !== undefined) {
            this[index] = obj[value]
        }
    })

    return this
}

global.toBoolean = (value) => {
    if (typeof value === "boolean") {
        return value
    }

    if (typeof value === "string") {
        return value.toLowerCase() === "true"
    }

    return false
}

async function injectEnvFromInfisical() {
    const envMode = global.FORCE_ENV ?? global.isProduction ? "prod" : "dev"

    console.log(`🔑 Injecting env variables from INFISICAL in [${envMode}] mode...`)

    const client = new infisical({
        token: process.env.INFISICAL_TOKEN,
    })

    const secrets = await client.getAllSecrets({
        path: process.env.INFISICAL_PATH ?? "/",
        environment: envMode,
        attachToProcessEnv: false,
    })

    // inject to process.env
    secrets.forEach((secret) => {
        if (!(process.env[secret.secretName])) {
            process.env[secret.secretName] = secret.secretValue
        }
    })
}

async function handleExit(code, e) {
    if (code !== 0) {
        console.log(`🚫 Unexpected exit >`, code, e)
    }

    await global.eventBus.awaitEmit("exit", code)

    return process.exit(code)
}

async function main(api) {
    if (!api) {
        throw new Error("API is not defined")
    }

    if (process.env.INFISICAL_TOKEN) {
        await injectEnvFromInfisical()
    }

    const instance = new api()

    process.on("exit", handleExit)
    process.on("SIGINT", handleExit)
    process.on("uncaughtException", handleExit)
    process.on("unhandledRejection", handleExit)

    await instance.initialize()

    return instance
}

module.exports = main