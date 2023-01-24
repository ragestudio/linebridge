export default {
    "test": (req, res, next) => {
        console.log("Hello loaded middleware 1")
        next()
    }
}