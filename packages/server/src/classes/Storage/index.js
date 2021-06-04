const drivers = {
    "fs": require("./drivers/filesystem"),
    "memfs": require("./drivers/onMemory")
}

class Storage {
    constructor(params) {
        this.params = { ...params }

        this.type = this.params.type
        this.driver = null

        if (typeof drivers[this.params.driver] !== "undefined") {
            this.driver = drivers[this.params.driver]
        }

        if (typeof this.driver !== "undefined") {
            throw new Error(`Invalid storage driver!`)
        }
    }

    set = (key, value, options) => {
        this.driver.set(key, value, options)
    }

    get = (key) => {
        this.driver.get(key, value, options)
    }

    del = (key) => {

    }
}

module.exports = { Storage }