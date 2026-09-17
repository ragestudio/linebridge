import { Plugin } from "linebridge"
import SharedMap from "./shared-map"

export class ShmMapPlugin extends Plugin {
	contexts = {
		sharedMap: (mapId: string, maxEntries: number = 10000) =>
			new SharedMap(mapId, maxEntries),
	}

	initialize = async () => {
		console.log("ShmMapPlugin initialized")
	}
}

export default ShmMapPlugin
