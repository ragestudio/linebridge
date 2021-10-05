#!/usr/bin/env node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const { randomWord } = require("@corenode/utils")
    const lib = require("../server/index.js")

    // create server
    new lib.HttpServer({
        autoInit: true,
        id: process.env.serverID ?? randomWord.generate(),
    })
})