import nanoid from "../../../utils/nanoid"
import type RTEngine from "../index"

export default async function upgrade(this: RTEngine, req: any, res: any) {
	try {
		const context = {
			id: nanoid(),
			token: req.query.token,
			user: null,
			httpHeaders: req.headers,
		}

		if (typeof this.onUpgrade === "function") {
			await this.onUpgrade(context, req.query.token, res)
		} else {
			res.upgrade(context)
		}
	} catch (error) {
		console.error("Error upgrading connection:", error)
		res.status(401).end()
	}
}
