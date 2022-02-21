module.exports = function generateWSRequestDispatcher(instance, channel) {
    return function (...payload) {
        return new Promise(async (resolve, reject) => {
            const req = instance.emit(channel, ...payload)

            req.on("response", (...args) => {
                return resolve(...args)
            })

            req.on("responseError", (...args) => {
                return reject(...args)
            })
        })
    }
}