const assert = require('assert')
const linebridgeClient = require('../dist/client/index.js')
const linebridgeServer = require('../dist/server/index.js')

const exampleTestHTTPPort = 3010

let exampleServer = null
let exampleController = null
let exampleBridge = null

describe('[Linebridge Server]', async function () {
    it('should export', function () {
        assert.equal(typeof linebridgeServer, 'function')
    })

    it("initialize example server", async function () {
        exampleServer = new linebridgeServer({
            port: exampleTestHTTPPort,
            endpoints: [
                {
                    route: '/test',
                    method: 'GET',
                    fn: function (req, res) {
                        return res.send({test: 'testing'})
                    }
                }
            ]
        })

        await exampleServer.init()
    })
})

describe('[Linebridge Client]', async function () {
    it('exports should be lib objects and functions', function () {
        assert.equal(typeof linebridgeClient, 'object')
    })

    it("create example controller", async function () {
        exampleController = new linebridgeClient.Controller({
            servers: [
                `http://localhost:${exampleTestHTTPPort}`
            ]
        })

        await exampleController.initialize()

        console.log(exampleController)
    })

    it("create example bridge", async () => {
        exampleBridge = new linebridgeClient.Bridge({
            origin: `http://localhost:${exampleTestHTTPPort}`,
            headers: {
                'Content-Type': 'application/json'
            }
        })

        await exampleBridge.initialize()
    })

    it("bridge.endpoints is an object", async () => {
        assert.equal(typeof exampleBridge.endpoints, 'object')
    })

    it("test endpoint should correctly respond", async () => {
        let response = await exampleBridge.endpoints.get.test()
        assert.equal(response.test, 'testing')
    })
})