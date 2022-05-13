const axios = require("axios")

function createRemoteEventDispatcher(origin, ) {
    return async (event, payload) => {
      
    }
}

async function resolveRemoteEvents(origin) {
    const { data } = await axios.get(origin)

    let dispatchers = {}

    data.remoteEvents.forEach((entry) => {
        if (typeof dispatchers[entry.controller] === "undefined") {
            dispatchers[entry.controller] = {}
        }

        entry.events.forEach((event) => {
            dispatchers[entry.controller][event] = () => {

            }
        })


       
    })
}

module.exports = resolveRemoteEvents