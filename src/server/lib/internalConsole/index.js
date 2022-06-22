module.exports = class InternalConsole {
    static log = (...args) => {
        if (!global.consoleSilent) {
            console.log(...args)
        }
    }

    static error = (...args) => {
        if (!global.consoleSilent) {
            console.error(...args)
        }
    }

    static warn = (...args) => {
        if (!global.consoleSilent) {
            console.warn(...args)
        }
    }

    static info = (...args) => {
        if (!global.consoleSilent) {
            console.info(...args)
        }
    }

    static debug = (...args) => {
        if (!global.consoleSilent) {
            console.debug(...args)
        }
    }

    static table = (...args) => {
        if (!global.consoleSilent) {
            console.table(...args)
        }
    }
}