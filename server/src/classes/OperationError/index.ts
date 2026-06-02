export default class OperationError extends Error {
	code: number

	constructor(code: number = 500, message: string) {
		super(message)
		this.code = code
	}
}
