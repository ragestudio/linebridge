import type { Server } from "../../server"

export class Plugin<EngineType extends string = "neo"> {
	readonly server: Server<EngineType>

	constructor(server: Server<EngineType>) {
		this.server = server
	}

	initialize!: () => Promise<void>
}

export default Plugin
