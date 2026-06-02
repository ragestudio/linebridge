import type Server from "../../server"

export interface OperationResult {
	ok: boolean
	data?: any
	error?: any
}

export interface NatsClientContext {
	id: string
	socket_id: string
	token?: string
	user_id?: string
	userId?: string
	username?: string
	user?: Record<string, any>
	avatar?: string
}
