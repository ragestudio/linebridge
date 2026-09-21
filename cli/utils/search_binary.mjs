import { access } from "node:fs/promises"
import { constants } from "node:fs"
import { join, delimiter } from "node:path"

export async function searchBinary(binName) {
	const envPath = process.env.PATH || ""
	const dirs = envPath.split(delimiter)

	for (const dir of dirs) {
		if (!dir) continue

		const _path = join(dir, binName)

		try {
			await access(_path, constants.X_OK)

			return _path
		} catch (error) {
			continue
		}
	}

	return null
}

export default searchBinary
