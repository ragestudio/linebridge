const assert = require("assert")
const linebridgeServer = require("../dist/server/index.js")

const exampleTestHTTPPort = 3010

const testEndpoints = [
    {
        route: "/test",
        method: "GET",
        fn: function (req, res) {
            return res.send({ test: "testing" })
        }
    },
    {
        route: "/disabledByDefault",
        method: "GET",
        fn: function (req, res) {
            return res.send("This must not be sended")
        },
        enabled: false,
    },
    {
        route: "/shouldBeDisabled",
        method: "GET",
        fn: function (req, res) {
            return res.send("This must not be sended after use `toogleEndpointReachability`")
        }
    }
]

let exampleServer = null

describe("[Server]", async function () {
    it("should export", function () {
        assert.equal(typeof linebridgeServer, "function")
    })

    it("create server", async function () {
        exampleServer = new linebridgeServer({
            port: exampleTestHTTPPort,
        })
    })

    it("register test controllers", async function () {
        testEndpoints.forEach((endpoint) => {
            exampleServer.registerHTTPEndpoint(endpoint)
        })
    })

    it("initialize server", async function () {
        await exampleServer.initialize()
    })

    it("toogleEndpointReachability", async function () {
        exampleServer.toogleEndpointReachability("get", "/shouldBeDisabled", false)

        // check if endpoint is disabled
        assert.equal(exampleServer.endpointsMap["get"]["/shouldBeDisabled"].enabled, false)
    })
})