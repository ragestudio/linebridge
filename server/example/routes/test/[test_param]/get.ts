export default {
	fn: (req, res) => {
		res.json({
			query_params: req.params,
		})
	},
}
