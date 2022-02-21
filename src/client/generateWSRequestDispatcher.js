module.exports = function generateWSRequestDispatcher(instance, channel) {
    return function (...payload) {
        return new Promise(async (resolve, reject) => {
            const req = instance.emit(channel, ...payload)

            req.on("response", (socket, ...args) => {
                return resolve(socket, ...args)
            })

            req.on("responseError", (socket, ...args) => {
                return reject(socket, ...args)
            })
        })
    }
}