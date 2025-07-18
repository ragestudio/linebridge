import fs from "node:fs"

import getRouteredFunctions from "../utils/getRouteredFunctions"
import flatRouteredFunctions from "../utils/flatRouteredFunctions"

export default async (startDir, server) => {
	if (!server.engine.ws || !fs.existsSync(startDir)) {
		return null
	}

	let events = await getRouteredFunctions(startDir)

	events = flatRouteredFunctions(events)

	if (typeof events !== "object") {
		return null
	}

	if (typeof server.engine.ws.registerEvents === "function") {
		await server.engine.ws.registerEvents(events)
	} else {
		for (const eventKey of Object.keys(events)) {
			server.engine.ws.events.set(eventKey, events[eventKey])
		}
	}

	return server
}
