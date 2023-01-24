export default {
    method: "get",
    route: "/middlewaresTest",
    middlewares: ["test", (req, res, next) => {
        console.log("Hello from inline middleware 2")
        next()
    }],
    fn: async (req, res) => {
        return res.json({
            message: "Hello world! Look at the console for the middlewares!"
        })
    }
}