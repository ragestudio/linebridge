/**
 * Type definitions for the RTEngine (real-time WebSocket engine) subsystem.
 *
 * RTEngine is the WebSocket layer of Linebridge, built on uWebSockets.js.
 * It manages client connections, event dispatching, and topic-based pub/sub.
 *
 * @module RtEngine/types
 */

import type { WebsocketHandlerFunction } from "../../classes/Handler/websocket"

/**
 * Configuration options passed when creating an RTEngine instance.
 */
export interface RtEngineConfig {
	/** User-defined event handlers keyed by event name */
	events?: Record<string, WebsocketHandlerFunction>

	/**
	 * Called during the HTTP-to-WebSocket upgrade handshake.
	 * Receives the request context, token, and response object.
	 * Can be used for authentication before allowing the upgrade.
	 */
	onUpgrade?:
		| ((context: any, token: string, res: any) => Promise<void>)
		| null

	/** Called after a WebSocket connection is established */
	onConnection?: ((socket: any) => Promise<void>) | null

	/** Called when a WebSocket connection is closed */
	onDisconnect?: ((socket: any, client?: any) => Promise<void>) | null

	/** URL path to listen for WebSocket connections on (defaults to "/") */
	path?: string
}

export interface RtEngineContext {
	/** Unique identifier for this socket connection */
	id: string
	/** Authenticated user object (null when not authenticated) */
	user?: { _id: string; [key: string]: any } | null
	/** Active session data */
	session?: any
	/** Additional context properties */
	[key: string]: any
}

/**
 * Represents a raw uWebSockets.js socket as seen by the RTEngine layer.
 *
 * Each socket carries a context object attached during the upgrade handshake,
 * and provides methods to send data, manage topic subscriptions, and
 * register event listeners.
 */
export interface RtEngineSocket {
	/**
	 * Context attached to the socket during the upgrade handshake.
	 * Contains a unique id, optional authenticated user/session data,
	 * and any extra user-defined properties.
	 */
	context: RtEngineContext

	/** Sends a string payload directly to this client */
	send: (data: string) => any

	/** Publishes a message to all subscribers of the given topic */
	publish: (topic: string, data: string) => void

	/** Subscribes this socket to a topic for pub/sub delivery */
	subscribe: (topic: string) => void

	/** Unsubscribes this socket from a topic */
	unsubscribe: (topic: string) => void

	/** Registers a listener for a socket-level event (e.g. "message", "close") */
	on: (event: string, handler: (...args: any[]) => void) => void

	/** List of topics this socket is currently subscribed to */
	topics: string[]
}

export interface RtEngineEventData {
	event: string
	data?: any
	error?: any
	ack?: boolean
}
