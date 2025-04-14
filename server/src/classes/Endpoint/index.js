import { HttpRequestHandler } from "../Handler"

export default class Endpoint {
	static _constructed = false
	static _class = true

	constructor(method, context) {
		this._constructed = true
		this.context = context

		if (typeof method === "function") {
			this.run = method
		}

		this.handler = new HttpRequestHandler(this.run, this.context)
	}
}
