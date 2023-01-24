import { Controller } from "../../../../src/server"
import generateEndpointsFromDir from "../../../../src/server/lib/generateEndpointsFromDir"

export default class TestController extends Controller {
    static useRoute = "/test"

    httpEndpoints = generateEndpointsFromDir(__dirname + "/endpoints")
}