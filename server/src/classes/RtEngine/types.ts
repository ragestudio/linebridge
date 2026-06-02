import type { WebsocketHandlerFunction } from "../../classes/Handler/websocket"

export interface RtEngineConfig {
	events?: Record<string, WebsocketHandlerFunction>
	onUpgrade?:
		| ((context: any, token: string, res: any) => Promise<void>)
		| null
	onConnection?: ((socket: any) => Promise<void>) | null
	onDisconnect?: ((socket: any, client?: any) => Promise<void>) | null
	path?: string
}

export interface RtEngineSocket {
	context: {
		id: string
		user?: { _id: string } | null
		session?: any
		[key: string]: any
	}
	send: (data: string) => any
	publish: (topic: string, data: string) => void
	subscribe: (topic: string) => void
	unsubscribe: (topic: string) => void
	on: (event: string, handler: (...args: any[]) => void) => void
	topics: string[]
}
