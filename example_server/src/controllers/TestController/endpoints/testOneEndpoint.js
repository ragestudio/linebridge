import { Endpoint } from "../../../../../src/server"

export default class TestOneEndpoint extends Endpoint {
    static method = "get"

    static route = "/one"

    fn = async (req, res) => {
        return res.json({
            message: "Hello world! Im using Endpoint class!"
        })
    }
}