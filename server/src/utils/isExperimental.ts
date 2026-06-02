import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"

export default (): boolean => {
	return fs.existsSync(path.resolve(Vars.rootLibPath, ".experimental"))
}
