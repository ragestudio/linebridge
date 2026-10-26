async function request(path, options = {}) {
	const response = await fetch(`/api${path}`, {
		headers: { "Content-Type": "application/json" },
		...options,
	})

	const text = await response.text()
	let payload = null

	if (text) {
		try {
			payload = JSON.parse(text)
		} catch {
			payload = text
		}
	}

	if (!response.ok) {
		const message =
			payload && typeof payload === "object" && payload.error
				? payload.error
				: `request failed with status ${response.status}`

		throw new Error(message)
	}

	return payload
}

export const api = {
	health: () => request("/health"),
	config: () => request("/config"),
	system: () => request("/system"),
	services: () => request("/services"),
	serviceDetail: (id) => request(`/services/${encodeURIComponent(id)}`),
	startService: (id) =>
		request(`/services/${encodeURIComponent(id)}/start`, {
			method: "POST",
		}),
	stopService: (id) =>
		request(`/services/${encodeURIComponent(id)}/stop`, { method: "POST" }),
	restartService: (id) =>
		request(`/services/${encodeURIComponent(id)}/restart`, {
			method: "POST",
		}),
	logs: (scope = "all", limit = 500) =>
		request(
			`/logs?scope=${encodeURIComponent(scope)}&limit=${encodeURIComponent(limit)}`,
		),
	clearLogs: () => request("/logs", { method: "DELETE" }),
	websocket: () => request("/websocket"),
	closeConnection: (id, body) =>
		request(`/websocket/${encodeURIComponent(id)}/close`, {
			method: "POST",
			body: JSON.stringify(body || {}),
		}),
	presence: () => request("/presence"),
	presenceUser: (id) => request(`/presence/${encodeURIComponent(id)}`),
	redisInfo: () => request("/redis/info"),
	redisKeys: (pattern, limit) =>
		request(
			`/redis/keys?pattern=${encodeURIComponent(pattern)}&limit=${encodeURIComponent(limit)}`,
		),
	redisExec: (command, args) =>
		request("/redis/exec", {
			method: "POST",
			body: JSON.stringify({ command, args }),
		}),
}

export function connectStream({ onEvent, onStatus }) {
	let socket = null
	let attempts = 0
	let retryTimer = null
	let closed = false

	const protocol = location.protocol === "https:" ? "wss" : "ws"
	const url = `${protocol}://${location.host}/api/ws`

	const schedule = () => {
		if (closed) return

		const delay = Math.min(5000, 400 * 2 ** Math.min(attempts, 4))
		attempts++
		retryTimer = setTimeout(connect, delay)
	}

	const connect = () => {
		if (closed) return

		onStatus("connecting")
		socket = new WebSocket(url)

		socket.onopen = () => {
			attempts = 0
			onStatus("connected")
		}

		socket.onmessage = (event) => {
			try {
				onEvent(JSON.parse(event.data))
			} catch (error) {
				console.error("invalid control stream payload", error)
			}
		}

		socket.onerror = () => {
			if (socket) socket.close()
		}

		socket.onclose = () => {
			if (closed) return
			onStatus("disconnected")
			schedule()
		}
	}

	connect()

	return {
		subscribe(scopes) {
			if (socket && socket.readyState === WebSocket.OPEN) {
				socket.send(JSON.stringify({ type: "subscribe", scopes }))
			}
		},
		close() {
			closed = true
			clearTimeout(retryTimer)
			if (socket) socket.close()
		},
	}
}
