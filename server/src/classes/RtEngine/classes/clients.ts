import type RTEngine from "../index"
import type Client from "./client"

export default class Clients extends Map<string, Client> {
	engine: RTEngine

	constructor(engine: RTEngine) {
		super()
		this.engine = engine
	}
}
