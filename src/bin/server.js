#!/usr/bin/env node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const { randomWord } = require("@corenode/utils")
    const server = require("../server/index.js")

    // create server
    new server({
        autoInit: true,
        id: process.env.serverID ?? randomWord.generate(),
    })
})