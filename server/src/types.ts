/**
 * Core TypeScript types used throughout the framework.
 */
import type { Server } from "./server"

/**
 * Extracts the known keys from a type, excluding string-index and
 * number-index signatures. Useful for getting autocompletion on
 * context / middleware registries without exposing internal keys.
 */
export type KnownKeys<T = any> = keyof {
	[K in keyof T as string extends K
		? never
		: number extends K
			? never
			: K]: T[K]
}

/** Union of context keys available to a route on a given Server subclass. */
export type ContextsKeys<Child extends Server = Server> = KnownKeys<
	Child["contexts"] & Server["base_contexts"]
>

/** Union of middleware keys available on a given Server subclass. */
export type MiddlewaresKeys<Child extends Server = Server> = KnownKeys<
	Child["middlewares"] & Server["base_middlewares"]
>

/** Resolved contexts object (merges user-defined + base contexts). */
export type Contexts<Child extends Server = Server> = Child["contexts"] &
	Server["base_contexts"]

/** Signature for an IPC event handler function. */
export interface IPCEventFn {
	(contexts: Record<string, any>, data: any): any
}

/** Registry of IPC event name -> handler. */
export interface IPCEvents {
	[event: string]: IPCEventFn
}

/** Data extracted from NATS message headers that identifies a client. */
export interface NatsClientContext {
	id: string
	socket_id: string
	token: string
	user_id: string
	userId: string
	username: string
	user?: Record<string, any>
}

/**
 * Interface that server plugins must implement.
 * The `initialize` method is called after the engine starts.
 */
export interface ServerPlugin {
	initialize?: () => Promise<void>
}
