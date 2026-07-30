import type RTEClient from ".."

/**
 * Handles error events.
 */
export default function (this: RTEClient, data: unknown, payload: any): void {
	console.error(
		`[rt/${this.params.refName}] error:`,
		data ?? (payload?.error as Error),
	)
}
