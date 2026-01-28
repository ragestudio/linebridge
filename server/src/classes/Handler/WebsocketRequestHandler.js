export default class WebsocketRequestHandler {
	constructor(engine, params) {
		this.engine = engine
		this.params = params

		this.ctx = null
		this.ackEvent = `ack_${this.params.event}`

		// apply contexts
		if (
			Array.isArray(this.params.useContexts) &&
			this.params.useContexts.length > 0
		) {
			this.ctx = {}

			for (const key of this.params.useContexts) {
				this.ctx[key] = this.engine.server.contexts[key]
			}
		}
	}

	async execute(client, payload) {
		let result = null
		let error = null

		let contextToPass = null

		if (this.ctx) {
			if (payload && typeof payload === "object") {
				Object.assign(payload, this.ctx)
				contextToPass = payload
			} else {
				contextToPass = { ...this.ctx, ...payload }
			}
		} else {
			contextToPass = payload
		}

		try {
			result = await this.params.fn(client, payload.data, contextToPass)
		} catch (err) {
			if (!(err instanceof OperationError)) {
				console.debug(`[ws] 500 ${this.params.event} >`, err)
			}

			error = err
		}

		// return the result
		return [result, error]
	}
}
