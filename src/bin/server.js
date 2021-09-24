#!/usr/bin/env node
const corenode = require("corenode")

corenode.runInNewRuntime(() => {
    const { randomWord } = require("@corenode/utils")
    const cloudlink = require("../index.js")

    // create server
    new cloudlink.Server({
        autoInit: true,
        id: process.env.serverID ?? randomWord.generate(),
    })
})