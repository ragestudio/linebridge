class Controller {
    constructor(key, exec, params) {
        this.key = key ?? "controller"
        this.params = { ...params }

        if (typeof exec === "function") {
            this.exec = exec
        }
    }

    exec(req, res, next) {
        res.json(`empty response`)
    }
}

module.exports = { Controller }