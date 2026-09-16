import API from "@/index"

export default defineRoute(API)({
	useMiddlewares: ["test", "injectTest"],
	useContexts: ["sum", "server"],
	fn: (req, res, ctx) => {
		const testSum = ctx.sum(5, 10)

		return {
			hello: "world",
			test_value: req.test,
			sum: testSum,
			params: ctx.server.params,
		}
	},
})
