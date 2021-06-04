const path = require('path')
const fs = require('fs')

class FilesystemDriver {
    constructor(params) {
        this.params = params

        this.root = this.params.root ?? path.resolve(process.cwd(), 'storage')
    }

    set = () => {

    }

    get = () => {

    }

    del = () => {

    }
}

module.exports = { FilesystemDriver }