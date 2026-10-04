import type { EventHandler } from "../types"
import type WebsocketClient from "./index"
import type { EventPayload } from "./types"

/**
 * Registry of local event handlers.
 * Stores handlers by event name and dispatches incoming events to them,
 * including the built-in base handlers.
 */
export default class EventRegistry {
	constructor(client: WebsocketClient<any>) {
		this.client = client
	}

	client: WebsocketClient<any>

	/** Collection of event handlers */
	handlers: Map<string, Set<EventHandler>> = new Map()

	/** Registers a raw event handler object */
	add(event: string, reg: EventHandler): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, new Set())
		}

		this.handlers.get(event)?.add(reg)
	}

	/** Removes a raw event handler object */
	remove(event: string, reg: EventHandler): void {
		const eventHandlers = this.handlers.get(event)

		if (!eventHandlers) return

		eventHandlers.delete(reg)

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}

	/** Registers an event handler */
	on(event: string, handler: Function, once: boolean = false): void {
		this.add(event, { event, handler, once })
	}

	/** Registers a one-time event handler */
	once(event: string, handler: Function): void {
		this.on(event, handler, true)
	}

	/** Removes an event handler */
	off(event: string, handler: Function): void {
		const eventHandlers = this.handlers.get(event)

		if (!eventHandlers) return

		for (const item of eventHandlers) {
			if (item.handler === handler) {
				eventHandlers.delete(item)
				break
			}
		}

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}

	/** Removes all registered handlers */
	removeAllListeners(): void {
		this.handlers.clear()
	}

	/** Dispatches an event to base and registered handlers */
	async dispatch(
		event: string,
		data?: any,
		payload: EventPayload = {},
	): Promise<void> {
		const client = this.client

		if (client.baseHandlers[event]) {
			await client.baseHandlers[event](data, payload)
		}

		const eventHandlers = this.handlers.get(event)

		if (!eventHandlers) return

		for (const reg of [...eventHandlers]) {
			if (reg.ack === true && !payload.ack) continue

			try {
				await reg.handler(data, payload)

				if (payload.error instanceof Error) {
					throw payload.error
				}
			} catch (error) {
				client.logger.error(
					`Event handler error ["${event}"]:\n\n`,
					error,
				)
			}

			if (reg.once === true) {
				eventHandlers.delete(reg)
			}
		}

		if (eventHandlers.size === 0) {
			this.handlers.delete(event)
		}
	}
}
