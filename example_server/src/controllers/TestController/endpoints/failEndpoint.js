export default {
    method: "get",
    route: "/fail",
    fn: async (req, res) => {
        throw new Error("Testing catch handler")

        return res.json({
            message: "This is not supposed to be here!"
        })
    },
    onCatch: async (err, req, res) => {
        return res.json({
            message: "Catch handler works!",
            error: err.message,
        })
    }
}