module.exports = class InternalConsole {
    constructor(params = {}) {
        this.params = params
    }

    exec = (type, ...args) => {
        if (global.consoleSilent) {
            return false
        }

        // fix unsupported types
        switch (type) {
            case "table": {
                return console.table(...args)
            }
        }

        if (this.params.server_name) {
            args.unshift(`[${this.params.server_name}]`)
        }

        return console[type](...args)
    }

    log = (...args) => this.exec("log", ...args)

    error = (...args) => this.exec("error", ...args)

    warn = (...args) => this.exec("warn", ...args)

    info = (...args) => this.exec("info", ...args)

    debug = (...args) => this.exec("debug", ...args)

    table = (...args) => this.exec("table", ...args)
}