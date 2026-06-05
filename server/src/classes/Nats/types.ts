/**
 * @file shared types and interfaces for the NATS subsystem
 *
 * defines the contract for operation responses and client context
 * that flows between distributed Linebridge instances via NATS headers
 */

import type Server from "../../server"

/**
 * standard response shape for NATS operations across the cluster
 *
 * operations like findClientsByUserId or sendToTopic use this
 * to signal success/failure and carry payloads between services
 */
export interface OperationResult {
	/** whether the operation completed successfully */
	ok: boolean
	/** optional payload returned on success */
	data?: any
	/** optional error details returned on failure */
	error?: any
}

/**
 * contextual information about a client connected to a remote gateway
 *
 * this is serialized into NATS message headers so that any instance
 * in the cluster can rebuild a NatsClient proxy for that remote socket
 */
export interface NatsClientContext {
	/** unique client identifier (same as socket_id) */
	id: string
	/** the underlying websocket connection id */
	socket_id: string
	/** authentication token, if the client is logged in */
	token?: string
	/** snake_case alias for the authenticated user id */
	user_id?: string
	/** camelCase alias for the authenticated user id */
	userId?: string
	/** display name of the authenticated user */
	username?: string
	/** full user document, if available */
	user?: Record<string, any>
	/** url to the user's avatar image */
	avatar?: string
}
