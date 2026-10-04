import type RTEClient from ".."

/**
 * Handles error events.
 */
export default function (this: RTEClient, data: unknown, payload: any): void {
	this.logger.error("error:", data ?? (payload?.error as Error))
}
