export class Handler {
	constructor(fn, ctx) {
		this.fn = fn ?? (() => Promise.resolve())
		this.ctx = ctx ?? {}

		this.fn = this.fn.bind({
			contexts: this.ctx,
		})
	}
}

export class HttpRequestHandler extends Handler {
	constructor(fn, ctx) {
		super(fn, ctx)

		return this.exec
	}

	exec = async (req, res) => {
		try {
			req.ctx = this.ctx
			const result = await this.fn(req, res, this.ctx)

			if (result) {
				return res.json(result)
			}
		} catch (error) {
			// handle if is a operation error
			if (error instanceof OperationError) {
				return res.status(error.code).json({
					error: error.message,
				})
			}

			// if is not a operation error, that is a exception.
			// gonna handle like a generic 500 error
			console.error({
				message: "Unhandled route error:",
				description: error.stack,
			})

			return res.status(500).json({
				error: error.message,
			})
		}
	}
}

// TODO: Implement MiddlewareHandler
export class MiddlewareHandler extends Handler {}

// TODO: Implement WebsocketRequestHandler
export class WebsocketRequestHandler extends Handler {}

export default Handler
