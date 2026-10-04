export type ClientParams = {
	url: string
	token?: string | Function
	refName?: string
	maxConnectRetries?: number
	autoReconnect?: boolean
	heartbeat?: boolean
	worker?: boolean
}

export type ClientState = {
	id: string | null
	connected: boolean
	authenticated: boolean
	lastPing: number | null
	reconnecting: boolean
	connectionRetryCount: number
}

export type EventPayload = { error?: any; ack?: boolean }
export type EventData<T, K> = K extends keyof T ? T[K] : any

export type EventHandlerFunction<Data = any> = (
	data: Data,
	payload: EventPayload,
) => void | Promise<void>

export interface CoreEvents {
	open: void
	close: void
	error: Event
	message: any
	connected: any
	reconnected: void
	reconnecting: void
	reconnection_failed: void
	authenticate: string | Function
	ping: any
	"topic:subscribed": any
	"topic:unsubscribed": any
}
