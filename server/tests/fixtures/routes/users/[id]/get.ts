export default {
	useContexts: ["db"],
	useMiddlewares: ["auth"],
	fn: (req: any, res: any) => {
		res.json({ id: req.params.id })
	},
}
