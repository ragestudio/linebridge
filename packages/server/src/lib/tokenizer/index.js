const { validate, version, v5, v4 } = require('uuid')
const os = require('os')

function generate(hostname) {
    return v5(hostname ?? os.hostname(), v4())
}

function valid(uuid) {
    return validate(uuid) && version(uuid) === 5
}

module.exports = { generate, valid }