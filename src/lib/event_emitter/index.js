export default class EventEmitter {
    #events = {}

    on = (eventName, listener) => {
        if (!this.#events[eventName]) {
            this.#events[eventName] = []
        }

        this.#events[eventName].push(listener)

        return this
    }

    emit = (eventName, ...args) => {
        if (!this.#events[eventName]) {
            return false
        }

        this.#events[eventName].forEach((listener) => {
            listener(...args)
        })
    }

    off = (eventName, listener) => {
        if (!this.#events[eventName]) {
            return false
        }

        const index = this.#events[eventName].indexOf(listener)

        if (index > -1) {
            this.#events[eventName].splice(index, 1)
        } else {
            return false
        }

        return this
    }

    removeAllListeners = (eventName) => {
        if (!this.#events[eventName]) {
            return false
        }

        this.#events[eventName] = []

        return this
    }

    awaitEmit = async (eventName, ...args) => {
        if (!this.#events[eventName]) {
            return false
        }

        await Promise.all(this.#events[eventName].map(async (listener) => {
            await listener(...args)
        }))

        return this
    }

    hasEvent = (eventName) => {
        return !!this.#events[eventName]
    }
}