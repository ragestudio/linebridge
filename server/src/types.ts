/**
 * Core TypeScript types used throughout the framework.
 */
import type { Server } from "./server"
import type NeoRequest from "./engines/neo/request"
import type NeoResponse from "./engines/neo/response"

export type ServerRequest<T extends Server> =
	T extends Server<"neo">
		? NeoRequest
		: import("./classes/Handler/http").Request & { [key: string]: any }

export type ServerResponse<T extends Server> =
	T extends Server<"neo">
		? NeoResponse
		: import("./classes/Handler/http").Response

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

/**
 * Server-Sent Events stream interface.
 * Wraps an HTTP response to push real-time events to the client
 * using the standard EventSource protocol.
 */
export interface SSEventStream {
	/** Opens the SSE connection (sends an "open" comment). */
	open(): boolean

	/** Closes the SSE connection. */
	close(): boolean

	/** Sends a comment (prefixed with ": ") - useful as keep-alive. */
	comment(data: string): boolean

	/** Sends an event with id, event name, and data. */
	send(id: string, event: string, data: string): boolean
	/** Sends an event with event name and data (no id). */
	send(event: string, data: string): boolean
	/** Sends a data-only event (no id, no event name). */
	send(data: string): boolean

	/** Whether this SSE stream is still active (response not completed). */
	readonly active: boolean
}
