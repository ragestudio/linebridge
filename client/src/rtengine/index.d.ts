export type RTE_ClientParams = {
	refName: string
	autoReconnect: boolean
	maxConnectRetries: number
	heartbeat: boolean
	url: string
	token?: string | Function
	worker?: boolean
}

export type RTE_ClientState = {
	id: string | null
	connected: boolean
	authenticated: boolean
	lastPing: number | null
	lastPong: number | null
	latency: number | null
	reconnecting: boolean
	connectionRetryCount: number
}

export type RTE_EventHandler = {
	event: string // the event name to listen for
	handler: Function // the function to call when the event is emitted
	once: boolean // if true, the handler will be removed after the first invocation
	ack?: boolean // defined to indicate if the handler expects an acknowledgment
}
