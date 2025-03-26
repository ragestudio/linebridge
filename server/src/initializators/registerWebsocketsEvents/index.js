import fs from "node:fs"

import getRouteredFunctions from "../../utils/getRouteredFunctions"
import flatRouteredFunctions from "../../utils/flatRouteredFunctions"

export default async (startDir, engine) => {
	if (!engine.ws || !fs.existsSync(startDir)) {
		return engine
	}

	let events = await getRouteredFunctions(startDir)

	events = flatRouteredFunctions(events)

	if (typeof events !== "object") {
		return engine
	}

	if (typeof engine.ws.registerEvents === "function") {
		await engine.ws.registerEvents(events)
	} else {
		for (const eventKey of Object.keys(events)) {
			engine.ws.events.set(eventKey, events[eventKey])
		}
	}

	return engine
}
