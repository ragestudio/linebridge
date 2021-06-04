
module.exports = {
    default: (req, res, next) => {
        const { files } = req
        if (typeof files.file !== "undefined") {
            const { data, name, size, mimetype, md5 } = files.file

        }
    }
}