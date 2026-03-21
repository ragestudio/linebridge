// websocket instance
let socket = null

// Heartbeat state
let heartbeatEnabled = false
let heartbeatTimeout = 10000
let heartbeatTimer = null
let lastPongReceived = true

function stopHeartbeat() {
	if (heartbeatTimer) {
		clearTimeout(heartbeatTimer)
		heartbeatTimer = null
	}

	lastPongReceived = true
}

function doHeartbeat() {
	if (!socket || socket.readyState !== WebSocket.OPEN) return

	if (!lastPongReceived) {
		socket.close()
		return
	}

	lastPongReceived = false
	socket.send(JSON.stringify({ event: "ping" }))

	self.postMessage({ type: "ping_sent", payload: performance.now() })

	heartbeatTimer = setTimeout(doHeartbeat, heartbeatTimeout)
}

self.onmessage = (e) => {
	const { type, payload } = e.data

	// handle connect command
	if (type === "connect") {
		if (socket) {
			socket.close()
		}

		stopHeartbeat()

		const { url, heartbeat, heartbeatTimeout: hbTimeout } = payload

		socket = new WebSocket(url)
		heartbeatEnabled = heartbeat
		heartbeatTimeout = hbTimeout

		// forward open event
		socket.onopen = () => {
			self.postMessage({ type: "open" })

			if (heartbeatEnabled) {
				doHeartbeat()
			}
		}

		// forward close event
		socket.onclose = (event) => {
			stopHeartbeat()
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
			if (heartbeatEnabled) {
				try {
					const msg = JSON.parse(event.data)

					if (msg.event === "pong") {
						lastPongReceived = true
					}
				} catch (err) {
					console.error("Failed to parse heartbeat message", err)
				}
			}
			self.postMessage({ type: "message", payload: event.data })
		}
	}

	if (type === "send" && socket && socket.readyState === WebSocket.OPEN) {
		socket.send(payload)
	}

	if (type === "close" && socket) {
		stopHeartbeat()
		socket.close()
		socket = null
	}
}
