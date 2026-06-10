/**
 * @fileoverview Checks whether the project has experimental features enabled
 * by looking for a ".experimental" marker file in the library root path.
 *
 * If the file exists, experimental mode is active and the server may
 * enable unstable or work-in-progress features.
 */

import fs from "node:fs"
import path from "node:path"

import Vars from "../vars"

/**
 * Checks for the presence of a ".experimental" file in the library's
 * root directory (Vars.rootLibPath).
 *
 * @returns true if the .experimental marker file exists, false otherwise
 */
export default (): boolean => {
	return fs.existsSync(path.resolve(Vars.rootLibPath, ".experimental"))
}
