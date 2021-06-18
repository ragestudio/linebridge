const { Storage } = require('@ragestudio/cloudlink/dist/classes')
const path = require('path')
const { performance } = require('perf_hooks')

// TODO: Access token, permission object type

const handler = new Storage({ driver: "fs", root: path.resolve(process.cwd(), "uploads") })

module.exports = {
    set: (req, res, next) => {
        const { files } = req
        if (typeof files.file !== "undefined") {
            let file = files.file

            file.name = `${file.md5}_${file.name}`

            const timeBefore = performance.now()
            handler.setSync(file, undefined)
                .then((stat) => {
                    const tooks = (performance.now() - timeBefore).toFixed(2)
                    return res.json({
                        tooks: `~${tooks}ms`,
                        filename: file.name,
                        mimetype: file.mimetype,
                        encoding: file.encoding,
                        size: stat.size
                    })
                })
        }
    },
    get: (req, res, next) => {
        const { query } = req
        if (typeof query.file === "undefined") {
            res.status(404)
            return res.json({ error: "Not provided filename" })
        }

        handler.getSync(query.file)
            .then((data) => {
                res.write(data.buffer, 'binary')
                res.end(null, 'binary')
            })
            .catch((error) => {
                res.status(404)
                res.json({ error: error.message })
            })
    }
}