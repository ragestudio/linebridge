import cluster from "node:cluster"
import redis from "ioredis"
import SocketIO from "socket.io"
import { EventEmitter } from "@foxify/events"

import RedisMap from "../../lib/redis_map"

export default class RTEngineServer {
	constructor(params = {}) {
		this.params = params
		this.clusterMode = !!cluster.isWorker

		this.redisConnParams = {
			host:
				this.params.redisOptions?.host ??
				process.env.REDIS_HOST ??
				"localhost",
			port:
				this.params.redisOptions?.port ??
				process.env.REDIS_PORT ??
				6379,
			username:
				this.params.redisOptions?.username ??
				(process.env.REDIS_AUTH &&
					process.env.REDIS_AUTH.split(":")[0]),
			password:
				this.params.redisOptions?.password ??
				(process.env.REDIS_AUTH &&
					process.env.REDIS_AUTH.split(":")[1]),
			db: this.params.redisOptions?.db ?? process.env.REDIS_DB ?? 0,
		}

		this.redis = params.redis
		this.io = params.io
	}

	worker_id = nanoid()

	io = null
	redis = null

	connections = null
	users = null

	events = new Map()

	async initialize() {
		console.log("🌐 Initializing RTEngine server...")

		if (!this.io) {
			this.io = new SocketIO.Server({
				path: this.params.root ?? "/",
			})
		}

		if (!this.redis) {
			this.redis = new redis({
				lazyConnect: true,
				host: this.redisConnParams.host,
				port: this.redisConnParams.port,
				username: this.redisConnParams.username,
				password: this.redisConnParams.password,
				db: this.redisConnParams.db,
				maxRetriesPerRequest: null,
			})
		}

		await this.redis.connect()

		// create mappers
		this.connections = new RedisMap(this.redis, {
			refKey: "connections",
			worker_id: this.worker_id,
		})

		this.users = new RedisMap(this.redis, {
			refKey: "users",
			worker_id: this.worker_id,
		})

		// register middlewares
		if (
			typeof this.middlewares === "object" &&
			Array.isArray(this.middlewares)
		) {
			for (const middleware of this.middlewares) {
				this.io.use(middleware)
			}
		}

		// handle connection
		this.io.on("connection", (socket) => {
			this.eventHandler(this.onConnect, socket)
		})

		console.log(`[RTEngine] Listening...`)
		console.log(`[RTEngine] Universal worker id [${this.worker_id}]`)

		return true
	}

	close = () => {
		console.log(`Cleaning up RTEngine server...`)

		// WARN: Do not flush connections pls
		if (process.env.NODE_ENV !== "production") {
			console.log(`Flushing previus connections... (Only for dev mode)`)
			this.connections.flush()
		}

		if (this.clusterMode) {
			this.connections.flush(cluster.worker.id)
		}

		if (this.io) {
			this.io.close()
		}

		if (this.redis) {
			this.redis.quit()
		}
	}

	onConnect = async (socket) => {
		console.log(`[RTEngine] new:client | id [${socket.id}]`)

		// create eventBus
		socket.eventBus = new EventEmitter()
		socket.pendingTimeouts = new Set()

		// register events
		if (typeof this.events === "object") {
			for (const [key, handler] of this.events.entries()) {
				socket.on(key, (...args) => {
					this.eventHandler(handler, socket, ...args)
				})
			}
		}

		// handle ping
		socket.on("ping", () => {
			socket.emit("pong")
		})

		// handle disconnect
		socket.on("disconnect", () => {
			this.eventHandler(this.onDisconnect, socket)
		})

		await this.connections.set(socket.id, socket)

		if (this.params.requireAuth) {
			await this.onAuth(
				socket,
				null,
				this.params.handleAuth ?? this.handleAuth,
			)
		} else if (socket.handshake.auth.token ?? socket.handshake.query.auth) {
			await this.onAuth(
				socket,
				socket.handshake.auth.token ?? socket.handshake.query.auth,
				this.params.handleAuth ?? this.handleAuth,
			)
		}
	}

	onDisconnect = async (socket) => {
		console.log(`[RTEngine] disconnect:client | id [${socket.id}]`)

		if (socket.eventBus.emit) {
			socket.eventBus.emit("disconnect")
		} else {
			console.warn(
				`[${socket.id}][@${socket.userData.username}] Cannot emit disconnect event`,
			)
		}

		const conn = await this.connections.get(socket.id)

		if (conn) {
			if (conn.user_id) {
				await this.users.del(conn.user_id)
			}
		}

		await this.connections.del(socket.id)
	}

	onAuth = async (socket, token, handleAuth) => {
		if (typeof handleAuth !== "function") {
			console.log(`[RTEngine] [${socket.id}] No auth handler provided`)
			return false
		}

		if (!token) {
			if (socket.handshake.auth.token) {
				token = socket.handshake.auth.token
			}
			if (socket.handshake.query.auth) {
				token = socket.handshake.query.auth
			}
		}

		function err(code, message) {
			console.log(
				`[RTEngine] [${socket.id}] Auth error: ${code} >`,
				message,
			)

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
			const conn = await this.connections.has(socket.id)

			// check if connection update is valid to avoid race condition(When user disconnect before auth verification is completed)
			if (!conn) {
				console.log(`Auth aborted`)
				return false
			}

			this.users.set(authResult.user_id.toString(), {
				socket_id: socket.id,
				...authResult,
			})

			socket.emit("response:auth:ok")

			console.log(
				`[RTEngine] client:authenticated | socket_id [${socket.id}] | user_id [${authResult.user_id}] | username [@${authResult.username}]`,
			)
		}
	}

	eventHandler = async (fn, socket, payload) => {
		try {
			await fn(socket, payload, this)
		} catch (error) {
			console.error(error)

			if (typeof socket.emit === "function") {
				socket.emit("response:error", {
					code: 500,
					message: error.message,
				})
			}
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
		userBySocket: (socket_id) => {},
		userById: async (user_id) => {
			const user = await this.users.get(user_id)

			return user
		},
		socketByUserId: async (user_id) => {
			const user = await this.users.get(user_id)

			if (!user) {
				return null
			}

			const socket = await this.connections.get(user.socket_id)

			return socket
		},
	}
}
