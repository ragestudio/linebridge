export default class OperationError {
    constructor(code, message) {
        this.code = code ?? 500
        this.message = message
    }
}