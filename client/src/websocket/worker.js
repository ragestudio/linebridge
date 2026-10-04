// websocket instance
let socket = null

self.onmessage = (e) => {
	const { type, payload } = e.data

	// handle connect command
	if (type === "connect") {
		if (socket) {
			socket.close()
		}

		const { url } = payload

		socket = new WebSocket(url)

		// forward open event
		socket.onopen = () => {
			self.postMessage({ type: "open" })
		}

		// forward close event
		socket.onclose = (event) => {
			self.postMessage({
				type: "close",
				payload: {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				},
			})
		}

		// forward error event
		socket.onerror = () => {
			self.postMessage({ type: "error" })
		}

		// forward message event
		socket.onmessage = (event) => {
			self.postMessage({ type: "message", payload: event.data })
		}
	}

	if (type === "send" && socket && socket.readyState === WebSocket.OPEN) {
		socket.send(payload)
	}

	if (type === "close" && socket) {
		socket.close()
		socket = null
	}
}
