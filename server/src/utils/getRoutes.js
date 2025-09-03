export default (engine) => {
	const httpMap = {}
	const wsMap = []

	for (const { method, route } of engine.registers) {
		if (!httpMap[method]) {
			httpMap[method] = []
		}

		httpMap[method].push({
			route: route,
		})
	}

	if (engine.ws) {
		for (const [event, handler] of engine.ws.events.entries()) {
			wsMap.push(event)
		}
	}

	return {
		http: httpMap,
		websocket: wsMap,
	}
}
