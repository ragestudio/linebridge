export default class WebsocketRequestHandler {
	constructor(engine, params) {
		this.engine = engine
		this.params = params

		// apply contexts
		if (Array.isArray(this.params.useContexts)) {
			for (const key of this.params.useContexts) {
				this.ctx[key] = this.engine.server.contexts[key]
			}
		}
	}

	ctx = {}

	execute = async (client, payload) => {
		let result = null
		let error = null

		try {
			result = await this.params.fn(client, payload.data, {
				...this.ctx,
				...payload,
			})
		} catch (err) {
			if (!(err instanceof OperationError)) {
				console.log(`[ws] 500 ${this.params.event} >`, err)
			}

			error = err
		}

		// handle ack mode (only if no nats mode enabled)
		if (payload.ack === true && !this.engine.nats) {
			client.socket.send(
				this.engine.encode({
					event: `ack_${this.params.event}`,
					error: error?.message ?? null,
					data: result,
				}),
			)
		}

		// return the result
		return [result, error]
	}
}
