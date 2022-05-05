const assert = require("assert")
const linebridgeClient = require("../dist/client/index.js")

const exampleTestHTTPPort = 3010

let exampleBridge = null

describe("[Client]", async function () {
    it("exports fine", function () {
        assert.equal(typeof linebridgeClient, "object")
        console.log(linebridgeClient)
    })

    it("create test bridge", async () => {
        exampleBridge = new linebridgeClient.Bridge({
            origin: `http://0.0.0.0:${exampleTestHTTPPort}`,
        })

        await exampleBridge.initialize()
    })

    it("bridge.endpoints is an object", async () => {
        assert.equal(typeof exampleBridge.endpoints, "object")
    })

    it("test endpoint should correctly respond", async () => {
        let response = await exampleBridge.endpoints.get.test()
        assert.equal(response.test, "testing")
    })
})