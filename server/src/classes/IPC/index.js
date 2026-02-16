class IPCClient {
	constructor(server, process) {
		this.server = server
		this.process = process
	}

	get isAvailable() {
		return !!this.server.nats
	}
}

export { IPCClient }
