export default {
    method: "get",
    route: "/withoutClass",
    fn: async (req, res) => {
        return res.json({
            message: "Im an object endpoint",
        })
    }
}