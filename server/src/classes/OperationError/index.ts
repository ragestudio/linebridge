/**
 * Custom error class for HTTP-aware error responses.
 *
 * When thrown inside a route handler or middleware, the framework catches it
 * and sends a JSON response with the specified HTTP status code.
 *
 * @example
 *   throw new OperationError(404, "User not found")
 *   // → { status: 404, body: { error: "User not found" } }
 */
export class OperationError extends Error {
	/** HTTP status code to send in the response. */
	code: number

	constructor(code: number = 500, message: string) {
		super(message)
		this.code = code
	}
}

export type OperationErrorType = typeof OperationError
export default OperationError
