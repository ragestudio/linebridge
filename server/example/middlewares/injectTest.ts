import type API from "../index"

export default defineMiddleware<typeof API>()({
	useContexts: ["sum", "sharedMap"],
	injectReq: {} as { test: string },
	fn: async (req, res, next, ctx) => {
		ctx.sharedMap
		req.test = "test"
		next()
	},
})
