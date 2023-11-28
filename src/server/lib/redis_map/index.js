export default class RedisMap {
    constructor(redis, params = {}) {
        if (!redis) {
            throw new Error("redis client is required")
        }

        this.redis = redis
        this.params = params

        this.refKey = this.params.refKey

        if (!this.refKey) {
            throw new Error("refKey is required")
        }
    }

    set = async (key, value) => {
        if (!key) {
            console.warn(`[redis:${this.refKey}] Failed to set entry with no key`)
            return
        }

        if (!value) {
            console.warn(`[redis:${this.refKey}] Failed to set entry [${key}] with no value`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        //console.log(`[redis:${this.refKey}] Setting entry [${key}]`,)

        await this.redis.hset(redisKey, value)

        return value
    }

    get = async (key, value) => {
        if (!key) {
            console.warn(`[redis:${this.refKey}] Failed to get entry with no key`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        let result = null

        if (value) {
            result = await this.redis.hget(redisKey, value)
        } else {
            result = await this.redis.hgetall(redisKey)
        }

        if (Object.keys(result).length === 0) {
            result = null
        }

        return result
    }

    getMany = async (keys) => {
        if (!keys) {
            console.warn(`[redis:${this.refKey}] Failed to get entry with no key`)
            return
        }

        const redisKeys = keys.map((key) => `${this.refKey}:${key}`)

        const pipeline = this.redis.pipeline()

        for (const redisKey of redisKeys) {
            pipeline.hgetall(redisKey)
        }

        let results = await pipeline.exec()

        results = results.map((result) => {
            return result[1]
        })

        // delete null or empty objects
        results = results.filter((result) => {
            if (result === null) {
                return false
            }

            if (Object.keys(result).length === 0) {
                return false
            }

            return true
        })

        return results
    }

    del = async (key) => {
        if (!key) {
            console.warn(`[redis:${this.refKey}] Failed to delete entry with no key`)
            return false
        }

        const redisKey = `${this.refKey}:${key}`

        const data = await this.get(key)

        if (!data) {
            return false
        }

        await this.redis.hdel(redisKey, Object.keys(data))

        return true
    }

    getAll = async () => {
        let map = []

        let nextIndex = 0

        do {
            const [nextIndexAsStr, results] = await this.redis.scan(
                nextIndex,
                "MATCH",
                `${this.refKey}:*`,
                "COUNT",
                100
            )

            nextIndex = parseInt(nextIndexAsStr, 10)

            map = map.concat(results)

        } while (nextIndex !== 0)

        return map
    }

    update = async (key, data) => {
        if (!key) {
            console.warn(`[redis:${this.refKey}] Failed to update entry with no key`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        let new_data = await this.get(key)

        if (!new_data) {
            console.warn(`[redis:${this.refKey}] Object [${key}] not exist, nothing to update`)

            return false
        }

        new_data = {
            ...new_data,
            ...data,
        }

        await this.redis.hset(redisKey, new_data)

        return new_data
    }

    flush = async (worker_id) => {
        let nextIndex = 0

        do {
            const [nextIndexAsStr, results] = await this.redis.scan(
                nextIndex,
                "MATCH",
                `${this.refKey}:*`,
                "COUNT",
                100
            )

            nextIndex = parseInt(nextIndexAsStr, 10)

            const pipeline = this.redis.pipeline()

            for await (const key of results) {
                const key_id = key.split(this.refKey + ":")[1]

                const data = await this.get(key_id)

                if (!data) {
                    continue
                }

                if (worker_id) {
                    if (data.worker_id !== worker_id) {
                        continue
                    }
                }

                pipeline.hdel(key, Object.keys(data))
            }

            await pipeline.exec()
        } while (nextIndex !== 0)
    }

    size = async () => {
        let count = 0

        let nextIndex = 0

        do {
            const [nextIndexAsStr, results] = await this.redis.scan(
                nextIndex,
                "MATCH",
                `${this.refKey}:*`,
                "COUNT",
                100
            )

            nextIndex = parseInt(nextIndexAsStr, 10)

            count = count + results.length
        } while (nextIndex !== 0)

        return count
    }
}