import type API from "../index"

export default defineMiddleware<typeof API>()({
	useContexts: ["sum"],
	injectReq: {} as { test: string },
	fn: async (req, res, next, ctx) => {
		req.test = "test"
		next()
	},
})
