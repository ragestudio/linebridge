#!/usr/bin/env EXPERIMENTAL_FASTCALL=1 node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const { Server } = require("../server/index.js")

    const instance = new Server({
        id: process.env.serverID,
    })

    instance.initialize()
})