export default {
    method: "get",
    route: "/",
    fn: async (req, res) => {
        return res.json({
            message: "Hello world!"
        })
    }
}