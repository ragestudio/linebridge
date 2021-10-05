#!/usr/bin/env node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const { randomWord } = require("@corenode/utils")
    const lib = require("../index.js")

    // create server
    new lib.Server({
        autoInit: true,
        id: process.env.serverID ?? randomWord.generate(),
    })
})