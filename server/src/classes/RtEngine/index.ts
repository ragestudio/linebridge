import Clients from "./classes/clients"
import BuiltInEvents from "./events"
import Handler, { HandlerKind } from "../Handler"

import findClientsByUserId from "./handlers/findClientsByUserId"
import handleMessage from "./handlers/message"
import handleConnection from "./handlers/connection"
import handleDisconnect from "./handlers/disconnect"
import handleUpgrade from "./handlers/upgrade"

import sendToTopic from "./handlers/sendToTopic"
import sendToClientId from "./handlers/sendToClientId"
import sendToUserId from "./handlers/sendToUserId"

import type Server from "../../server"
import type { RtEngineConfig, RtEngineSocket } from "./types"

class RTEngine {
	server: Server
	config: RtEngineConfig
	engine: any = null

	events: Map<string, Handler> = new Map()
	clients: Clients = new Clients(this)

	onUpgrade: RtEngineConfig["onUpgrade"]
	onConnection: RtEngineConfig["onConnection"]
	onDisconnect: RtEngineConfig["onDisconnect"]

	senders = {
		toTopic: sendToTopic.bind(this),
		toClientId: sendToClientId.bind(this),
		toUserId: sendToUserId.bind(this),
	}

	find = {
		clientsByUserId: findClientsByUserId.bind(this),
	}

	constructor(server: Server, config: RtEngineConfig = {}) {
		this.server = server
		this.config = config

		this.events = new Map()

		if (typeof config.events === "object") {
			for (const [event, handler] of Object.entries(config.events)) {
				this.events.set(
					event,
					new Handler({
						kind: HandlerKind.ws,
						engine: this.server.engine,
						event,
						fn: handler,
					} as any),
				)
			}
		}

		for (const [event, handler] of Object.entries(BuiltInEvents)) {
			this.events.set(
				event,
				new Handler({
					kind: HandlerKind.ws,
					engine: this.server.engine,
					event,
					fn: handler,
				} as any),
			)
		}

		this.onUpgrade = config.onUpgrade || null
		this.onConnection = config.onConnection || null
		this.onDisconnect = config.onDisconnect || null
	}

	handleMessage = handleMessage.bind(this)
	handleConnection = handleConnection.bind(this)
	handleDisconnect = handleDisconnect.bind(this)
	handleUpgrade = handleUpgrade.bind(this)

	registerEvent = (event: string, handler: any) => {
		if (typeof handler === "function") {
			handler = { fn: handler }
		}

		if (!handler.fn) {
			console.error("Event handler must have a function")
			return
		}

		const wsHandler = new Handler({
			kind: HandlerKind.ws,
			engine: this.server.engine,
			event,
			fn: handler.fn,
		} as any)

		this.events.set(event, wsHandler)
	}

	registerEvents = (obj: Record<string, any>) => {
		for (const [event, handler] of Object.entries(obj)) {
			this.registerEvent(event, handler)
		}
	}

	attach = (engine: any) => {
		if (typeof engine !== "undefined") {
			this.engine = engine
		}

		this.engine.app.ws(this.config.path ?? "/", this.handleConnection)
		this.engine.app.upgrade(this.config.path ?? "/", this.handleUpgrade)
	}

	close = () => {}

	encode = (data: any): string => {
		return JSON.stringify(data)
	}

	decode = (data: any): any => {
		return JSON.parse(data)
	}
}

export default RTEngine
