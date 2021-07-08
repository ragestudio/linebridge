//* LIBRARIES
const axios = require('axios')
const { websocket } = require('corenode/dist/net')

//* constables
const NETHUB_HOSTNAME = IS_DEV ? "localhost" : global.NETHUB_HOSTNAME = "nethub.ragestudio.net"
const nethubRequest = axios.create({
    baseURL: IS_DEV ? `http://localhost:1010` : `https://${NETHUB_HOSTNAME}`
})

//* HANDLERS
const getHeartbeat = (...context) => nethubRequest.get("heartbeat", ...context)
const putRegistry = (...context) => nethubRequest.put("registry", ...context)
const getRegistry = (...context) => nethubRequest.get("registry", ...context)
const deleteRegistry = (...context) => nethubRequest.delete("registry", ...context)

function heartbeat() {
    return new Promise((resolve, reject) => {
        getHeartbeat()
            .then((res) => {
                return resolve(res.data)
            })
            .catch((err) => {
                runtime.logger.dump("error", err)
                console.error(`❌ [${err.response?.status ?? "0"}] [${NETHUB_HOSTNAME}] Failed to listen heartbeat > ${err}`)
                return reject(err)
            })
    })
}

async function registerOrigin(payload) {
    putRegistry({ ...payload })
        .then((res) => {
            console.log(res.data)
        })
        .catch((err) => {
            console.log(err.response.data)
        })
}

async function getOrigin() {
    const hubData = await getRegistry()
    console.log(hubData)
}

module.exports = { heartbeat, registerOrigin, getOrigin }