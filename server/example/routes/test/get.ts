import API from "@/index"

export default defineRoute<API>()({
	useMiddlewares: ["test"],
	useContexts: ["sum", "server"] as const,
	fn: (req, res, ctx) => {
		const testSum = ctx.sum(5, 10)

		return {
			hello: "world",
			sum: testSum,
			params: ctx.server.params,
		}
	},
})

const a: RouteTypes[] = ["http"]
