/**
 * Handles error events.
 *
 * @param {Error} error - Error object.
 */
export default function (this: any, data: unknown, payload: any): void {
	console.error(
		`[rt/${this.params.refName}] error:`,
		data ?? (payload?.error as Error),
	)
}
