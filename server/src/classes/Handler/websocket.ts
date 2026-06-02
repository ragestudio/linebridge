export interface WsClient {
	id?: string
	socket_id?: string
	userId?: string | null
	user_id?: string
	username?: string
	token?: string
	user?: Record<string, any>
	session?: Record<string, any>
	emit: (
		event: string,
		data?: any,
		error?: any,
		ack?: boolean,
	) => Promise<any>
	error: (error: any) => Promise<any>
	ack: (event: string, data?: any, error?: any) => Promise<any>
	subscribe: (topic: string) => Promise<any>
	unsubscribe: (topic: string) => Promise<any>
	toTopic: (
		topic: string,
		event: string,
		data?: any,
		self?: boolean,
	) => Promise<any>
	operation: (type: string, data?: any) => Promise<any>
}

export type WebsocketHandlerFunction<TCtx = Record<string, any>> = (
	client: WsClient,
	data?: any,
	ctx?: TCtx,
) => any
