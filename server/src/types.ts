/**
 * Core TypeScript types used throughout the framework.
 */
import type { Server } from "./server"
import type { Request, Response } from "./classes/Handler/http"

export interface EnginesRequests<T = any> {}
export interface EnginesResponses<T = any> {}

export type ServerRequest<T = Server<any>> =
	ServerInstance<T> extends { __engine_type: infer E }
		? E extends keyof import("linebridge/types").EnginesRequests<T>
			? import("linebridge/types").EnginesRequests<T>[E]
			: Request & { [key: string]: any }
		: Request & { [key: string]: any }

export type ServerResponse<T = Server<any>> =
	ServerInstance<T> extends { __engine_type: infer E }
		? E extends keyof import("linebridge/types").EnginesResponses<T>
			? import("linebridge/types").EnginesResponses<T>[E]
			: Response & { [key: string]: any }
		: Response & { [key: string]: any }

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

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I,
) => void
	? I
	: never

type ExtractPluginContexts<Plugins extends any[]> = UnionToIntersection<
	Plugins[number] extends new (...args: any[]) => infer P
		? P extends { contexts: infer C }
			? C
			: {}
		: {}
>

export type ServerInstance<T> = T extends new (...args: any[]) => infer R
	? R
	: T

type _ExtractMiddlewares<T> = T extends { middlewares: infer M } ? M : {}
type _ExtractContexts<T> = T extends { contexts: infer C } ? C : {}

export type ExtractPlugins<T> = T extends { usePlugins: infer P }
	? P extends any[]
		? P
		: []
	: []

/** Union of context keys available to a route on a given Server subclass. */
export type ContextsKeys<Child = Server<any>> = KnownKeys<Contexts<Child>>

/** Union of middleware keys available on a given Server subclass. */
export type MiddlewaresKeys<Child = Server<any>> = KnownKeys<
	_ExtractMiddlewares<ServerInstance<Child>> & Server["base_middlewares"]
>

export type AllMiddlewares<Child = Server<any>> = _ExtractMiddlewares<
	ServerInstance<Child>
> &
	Server["base_middlewares"]

/** Resolved contexts object (merges user-defined + base contexts + plugin contexts). */
export type Contexts<Child = Server<any>> = _ExtractContexts<
	ServerInstance<Child>
> &
	Server["base_contexts"] &
	ExtractPluginContexts<ExtractPlugins<Child>>

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

export type ExtractReqExt<
	Child = Server<any>,
	K extends keyof AllMiddlewares<Child> = any,
> = UnionToIntersection<
	K extends any
		? AllMiddlewares<Child>[K] extends { _reqExt?: infer ReqExt }
			? NonNullable<ReqExt>
			: AllMiddlewares<Child>[K] extends {
						fn: { _reqExt?: infer ReqExt }
				  }
				? NonNullable<ReqExt>
				: {}
		: never
>

export type ExtractResExt<
	Child = Server<any>,
	K extends keyof AllMiddlewares<Child> = any,
> = UnionToIntersection<
	K extends any
		? AllMiddlewares<Child>[K] extends { _resExt?: infer ResExt }
			? NonNullable<ResExt>
			: AllMiddlewares<Child>[K] extends {
						fn: { _resExt?: infer ResExt }
				  }
				? NonNullable<ResExt>
				: {}
		: never
>
