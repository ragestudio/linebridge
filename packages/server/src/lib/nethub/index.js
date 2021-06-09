const axios = require('axios')

const NETHUB_URI = global.NETHUB_URI = "https://nethub.ragestudio.net"

const axiosInstance = axios.create({
    baseURL: NETHUB_URI
})

function heartbeat(params) {
    axiosInstance.get("heartbeat")
        .then((res) => {
            console.log(res.response.data)
        })
        .catch((err) => {
            console.log(err)
        })
}

function registerOrigin() {

}

function getOrigin() {

}

module.exports = { heartbeat, registerOrigin, getOrigin }