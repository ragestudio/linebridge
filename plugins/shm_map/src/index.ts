import Plugin from "./plugin"
import SharedMapClass from "./shared-map"

global.SharedMap = SharedMapClass

declare global {
	var SharedMap: typeof SharedMapClass
}

export { Plugin, SharedMapClass as SharedMap }

export default Plugin
