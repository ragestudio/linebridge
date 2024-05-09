export default class RedisMap {
    constructor(redis, params = {}) {
        if (!redis) {
            throw new Error("redis client is required")
        }

        if (!params.refKey) {
            throw new Error("refKey is required")
        }

        if (!params.worker_id) {
            throw new Error("worker_id is required")
        }

        this.redis = redis
        this.params = params

        this.refKey = this.params.refKey
        this.worker_id = this.params.worker_id
    }

    localMap = new Map()

    set = async (key, value) => {
        if (!key) {
            console.warn(`[redismap] (${this.refKey}) Failed to set entry with no key`)
            return
        }

        if (!value) {
            console.warn(`[redismap] (${this.refKey}) Failed to set entry [${key}] with no value`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        this.localMap.set(key, value)

       // console.log(`[redismap] (${this.refKey}) Set entry [${key}] to [${value}]`)

        await this.redis.hset(redisKey, {
            worker_id: this.worker_id,
        })

        return value
    }

    get = async (key, value) => {
        if (!key) {
            console.warn(`[redismap] (${this.refKey}) Failed to get entry with no key`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        let result = null

        if (this.localMap.has(key)) {
            result = this.localMap.get(key)
        } else {
            const remoteWorkerID = await this.redis.hget(redisKey, value)

            if (!remoteWorkerID) {
                return null
            }

            throw new Error("Redis stream data, not implemented...")
        }

        return result
    }

    del = async (key) => {
        if (!key) {
            console.warn(`[redismap] (${this.refKey}) Failed to delete entry with no key`)
            return false
        }

        const redisKey = `${this.refKey}:${key}`

        const data = await this.get(key)

        if (!data) {
            return false
        }

        if (this.localMap.has(key)) {
            this.localMap.delete(key)
        }

        await this.redis.hdel(redisKey, ["worker_id"])

        return true
    }

    update = async (key, data) => {
        if (!key) {
            console.warn(`[redismap] (${this.refKey}) Failed to update entry with no key`)
            return
        }

        const redisKey = `${this.refKey}:${key}`

        let new_data = await this.get(key)

        if (!new_data) {
            console.warn(`[redismap] (${this.refKey}) Object [${key}] not exist, nothing to update`)

            return false
        }

        new_data = {
            ...new_data,
            ...data,
        }

        //console.log(`[redismap] (${this.refKey}) Object [${key}] updated`)

        this.localMap.set(key, new_data)

        await this.redis.hset(redisKey, {
            worker_id: this.worker_id,
        })

        return new_data
    }

    has = async (key) => {
        if (!key) {
            console.warn(`[redismap] (${this.refKey}) Failed to check entry with no key`)
            return false
        }

        const redisKey = `${this.refKey}:${key}`

        if (this.localMap.has(key)) {
            return true
        }

        if (await this.redis.hget(redisKey, "worker_id")) {
            return true
        }

        return false
    }

    // flush = async (worker_id) => {
    //     let nextIndex = 0

    //     do {
    //         const [nextIndexAsStr, results] = await this.redis.scan(
    //             nextIndex,
    //             "MATCH",
    //             `${this.refKey}:*`,
    //             "COUNT",
    //             100
    //         )

    //         nextIndex = parseInt(nextIndexAsStr, 10)

    //         const pipeline = this.redis.pipeline()

    //         for await (const key of results) {
    //             const key_id = key.split(this.refKey + ":")[1]

    //             const data = await this.get(key_id)

    //             if (!data) {
    //                 continue
    //             }

    //             if (worker_id) {
    //                 if (data.worker_id !== worker_id) {
    //                     continue
    //                 }
    //             }

    //             pipeline.hdel(key, Object.keys(data))
    //         }

    //         await pipeline.exec()
    //     } while (nextIndex !== 0)
    // }

    // size = async () => {
    //     let count = 0

    //     let nextIndex = 0

    //     do {
    //         const [nextIndexAsStr, results] = await this.redis.scan(
    //             nextIndex,
    //             "MATCH",
    //             `${this.refKey}:*`,
    //             "COUNT",
    //             100
    //         )

    //         nextIndex = parseInt(nextIndexAsStr, 10)

    //         count = count + results.length
    //     } while (nextIndex !== 0)

    //     return count
    // }
}