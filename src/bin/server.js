#!/usr/bin/env EXPERIMENTAL_FASTCALL=1 node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const server = require("../server/index.js")

    const instance = new server({
        id: process.env.serverID,
    })

    instance.initialize()
})