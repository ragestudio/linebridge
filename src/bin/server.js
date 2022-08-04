#!/usr/bin/env EXPERIMENTAL_FASTCALL=1 node
const corenode = require("corenode")

corenode.runInNewRuntime(async () => {
    const { Server } = require("../server/index.js")

    const instance = new Server({
        id: process.env.serverID,
    })

    await instance.initialize()
})