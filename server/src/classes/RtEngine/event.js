export default class WSEvent {
	constructor(fn, middlewares = []) {
		this.fn = fn
		this.middlewares = middlewares
	}

	execute = async (socket, body) => {
		try {
			// execute middlewares
			for await (const middleware of this.middlewares) {
				await middleware(socket, body)
			}

			await this.fn(socket, body)
		} catch (error) {
			await this.onError(socket, body, error)
		}
	}

	onError = async (socket, body, error) => {}
}
