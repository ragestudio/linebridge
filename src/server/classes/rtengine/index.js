import socketio from "socket.io"
import redis from "ioredis"

import EventEmitter from "@foxify/events"

import { createAdapter as createRedisAdapter } from "@socket.io/redis-adapter"
import { createAdapter as createClusterAdapter } from "@socket.io/cluster-adapter"
import { setupWorker } from "@socket.io/sticky"
import { Emitter } from "@socket.io/redis-emitter"

import http from "node:http"
import cluster from "node:cluster"

import RedisMap from "../../lib/redis_map"

export default class RTEngineServer {
    constructor(params = {}) {
        this.params = params

        // servers
        this.http = this.params.http ?? undefined
        this.io = this.params.io ?? undefined
        this.redis = this.params.redis ?? undefined
        this.redisEmitter = null

        this.clusterMode = !!cluster.isWorker

        this.connections = null
        this.users = null
    }

    onConnect = async (socket) => {
        console.log(`🤝 New client connected on socket id [${socket.id}]`)

        socket.eventEmitter = new EventEmitter()

        if (typeof this.events === "object") {
            for (const event in this.events) {
                socket.on(event, (...args) => {
                    this.eventHandler(this.events[event], socket, ...args)
                })
            }
        }

        socket.on("disconnect", (_socket) => {
            this.eventHandler(this.onDisconnect, socket)
        })

        const conn_obj = {
            id: socket.id,
        }

        if (this.clusterMode) {
            conn_obj.worker_id = cluster.worker.id
            conn_obj._remote = true

            this.redisEmitter.serverSideEmit(`redis:conn:set`, conn_obj)
        }

        await this.connections.set(conn_obj.id, conn_obj)

        console.log(`⚙️ Awaiting authentication for client [${socket.id}]`)

        if (this.params.requireAuth) {
            await this.authenticateClient(socket, null, this.handleAuth ?? this.params.handleAuth)
        } else if (socket.handshake.auth.token) {
            await this.authenticateClient(socket, socket.handshake.auth.token, this.handleAuth ?? this.params.handleAuth)
        }

        if (process.env.NODE_ENV === "development") {
            const connected_size = await this.connections.size()

            console.log(`Total connected clients: ${connected_size}`)
        }
    }

    onDisconnect = async (socket,) => {
        console.log(`👋 Client disconnected on socket id [${socket.id}]`)

        if (socket.eventEmitter.emit) {
            socket.eventEmitter.emit("disconnect")
        } else {
            console.warn(`[${socket.id}][@${socket.userData.username}] Cannot emit disconnect event`)
        }

        const conn = await this.connections.get(socket.id)

        if (conn) {
            if (conn.user_id) {
                await this.users.del(conn.user_id)
            }
        }

        await this.connections.del(socket.id)

        const connected_size = await this.connections.size()

        console.log(`Total connected clients: ${connected_size}`)
    }

    authenticateClient = async (socket, token, handleAuth) => {
        if (typeof handleAuth !== "function") {
            console.warn(`Skipping authentication for client [${socket.id}] due no auth handler provided`)
            return false
        }

        if (!token) {
            if (socket.handshake.auth.token) {
                token = socket.handshake.auth.token
            }
        }

        function err(code, message) {
            console.error(`🛑 Disconecting client [${socket.id}] cause an auth error >`, code, message)

            socket.emit("response:error", {
                code,
                message,
            })

            socket.disconnect()

            return false
        }

        if (!token) {
            return err(401, "auth:token_required")
        }

        const authResult = await handleAuth(socket, token, err)

        if (authResult) {
            const conn = await this.connections.update(socket.id, authResult)

            // check if connection update is valid to avoid race condition(When user disconnect before auth verification is completed)
            if (!conn) {
                console.log(`Auth aborted`)
                return false
            }

            this.users.set(authResult.user_id, {
                socket_id: socket.id,
                ...authResult,
            })

            socket.emit("response:auth:ok")

            console.log(`✅ Authenticated client [${socket.id}] as [@${authResult.username}]`)
        }
    }

    find = {
        manyById: async (ids) => {
            if (typeof ids === "string") {
                ids = [ids]
            }

            const users = await this.users.getMany(ids)

            return users
        },
        userBySocket: (socket_id) => {

        },
        userById: async (user_id) => {
            const user = await this.users.get(user_id)

            console.log(user)

            return user
        }
    }

    eventHandler = async (fn, socket, ...args) => {
        try {
            await fn(socket, ...args)
        } catch (error) {
            console.error(error)

            if (socket.emit) {
                socket.emit("response:error", {
                    code: 500,
                    message: error.message,
                })
            }
        }
    }

    registerBaseEndpoints = (socket) => {
        if (!socket) {
            return socket
        }

        socket.on("ping", () => {
            socket.emit("pong")
        })

        return socket
    }

    async initialize({ host, port, username, password, db } = {}) {
        console.log("🌐 Initializing RTEngine server...")

        process.on("exit", this.cleanUp)
        process.on("SIGINT", this.cleanUp)
        process.on("SIGTERM", this.cleanUp)
        process.on("SIGBREAK", this.cleanUp)
        process.on("SIGHUP", this.cleanUp)

        // fullfill args
        if (typeof host === "undefined") {
            host = this.params.redis?.host ?? process.env.REDIS_HOST ?? "localhost"
        }

        if (typeof port === "undefined") {
            port = this.params.redis?.port ?? process.env.REDIS_PORT ?? 6379
        }

        if (typeof username === "undefined") {
            username = this.params.redis?.username ?? process.env.REDIS_USERNAME ?? (process.env.REDIS_AUTH && process.env.REDIS_AUTH.split(":")[0])
        }

        if (typeof password === "undefined") {
            password = this.params.redis?.password ?? process.env.REDIS_PASSWORD ?? (process.env.REDIS_AUTH && process.env.REDIS_AUTH.split(":")[1])
        }

        if (typeof db === "undefined") {
            db = this.params.redis?.db ?? process.env.REDIS_DB ?? 0
        }

        // create default servers
        if (typeof this.redis === "undefined") {
            this.redis = new redis({
                host,
                port,
                username: username,
                password: password,
                db: db,
            })
        }

        if (typeof this.http === "undefined") {
            this.http = http.createServer()
        }

        if (typeof this.io === "undefined") {
            this.io = new socketio.Server(this.http, {
                cors: {
                    origin: "*",
                    methods: ["GET", "POST"],
                    credentials: true,
                },
            })
        }

        // create mappers
        this.connections = new RedisMap(this.redis, {
            refKey: "connections",
        })

        this.users = new RedisMap(this.redis, {
            refKey: "users",
        })

        // setup clustered mode
        if (this.clusterMode) {
            console.log(`Connecting to redis as cluster worker id [${cluster.worker.id}]`)

            this.io.adapter(createClusterAdapter())

            const subClient = this.redis.duplicate()

            this.io.adapter(createRedisAdapter(this.redis, subClient))

            setupWorker(this.io)

            this.redisEmitter = new Emitter(this.redis)
        }

        // WARN: Do not flush connections pls
        if (process.env.NODE_ENV !== "production") {
            console.log(`Flushing previus connections... (Only for dev mode)`)
            await this.connections.flush()
        }

        // register middlewares
        if (typeof this.middlewares === "object" && Array.isArray(this.middlewares)) {
            for (const middleware of this.middlewares) {
                this.io.use(middleware)
            }
        }

        for (const event in this._redisEvents) {
            this.io.on(event, this._redisEvents[event])
        }

        this.io.on("connection", (socket) => {
            this.registerBaseEndpoints(socket)
            this.eventHandler(this.onConnect, socket)
        })

        if (typeof this.onInit === "function") {
            await this.onInit()
        }

        console.log(`✅ RTEngine server is running on port [${process.env.LISTEN_PORT}] ${this.clusterMode ? `on clustered mode [${cluster.worker.id}]` : ""}`)

        return true
    }

    cleanUp = async () => {
        console.log(`Cleaning up RTEngine server...`)

        this.connections.flush(cluster.worker.id)

        if (this.io) {
            this.io.close()
        }
    }
}