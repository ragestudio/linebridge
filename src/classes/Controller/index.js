class Controller {
    constructor(payload) {
        this.payload = {...payload}
        
        return this
    }

    exec = async (req, res, next) => {
        if (typeof this.payload.exec === "function") {
            try {
                await this.payload.exec (req, res, next)
            } catch (error) {
                return res.status(500).json({ error: error.message, endpoint: this.payload.route })
            }
        }
    }
}

module.exports = { Controller }