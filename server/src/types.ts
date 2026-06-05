import type { Server } from "./server"

export type KnownKeys<T = any> = keyof {
	[K in keyof T as string extends K
		? never
		: number extends K
			? never
			: K]: T[K]
}

export type ContextsKeys<Child extends Server = Server> = KnownKeys<
	Child["contexts"] & Server["base_contexts"]
>
export type MiddlewaresKeys<Child extends Server = Server> = KnownKeys<
	Child["middlewares"] & Server["base_middlewares"]
>
export type Contexts<Child extends Server = Server> = Child["contexts"] &
	Server["base_contexts"]

export interface IPCEventFn {
	(contexts: Record<string, any>, data: any): any
}

export interface IPCEvents {
	[event: string]: IPCEventFn
}

export interface NatsClientContext {
	id: string
	socket_id: string
	token: string
	user_id: string
	userId: string
	username: string
	user?: Record<string, any>
}

export interface ServerPlugin {
	initialize?: () => Promise<void>
}
