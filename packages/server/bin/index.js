#!/usr/bin/env corenode
const relic = require("../dist")
const script = process.argv[2]

// create server
new relic.Server({ autoInit: true })