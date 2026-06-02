import type { EngineAdaptor } from "../classes/EngineAdaptor"

interface RouteMap {
	path: string
}

interface RoutesResult {
	http: Record<string, RouteMap[]>
	websocket: string[]
}

export default (engine: EngineAdaptor): RoutesResult => {
	const httpMap: Record<string, RouteMap[]> = {}
	const wsMap: string[] = []

	for (const { method, path } of engine.registers) {
		if (!httpMap[method]) {
			httpMap[method] = []
		}

		httpMap[method].push({
			path: path,
		})
	}

	if (engine.ws) {
		for (const [event] of engine.ws.events.entries()) {
			wsMap.push(event)
		}
	}

	return {
		http: httpMap,
		websocket: wsMap,
	}
}
