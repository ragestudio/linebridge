import fs from "fs"
import path from "path"
import os from "os"

import downloadFile from "./download_file.mjs"
import searchRelease from "./search_release.mjs"

const platform = os.platform()
const arch = os.arch()

async function installGateway() {
	const binName = "ultragateway"
	const destPath = path.join(os.homedir(), ".local", "bin", binName)

	if (fs.existsSync(destPath)) {
		return destPath
	} else {
		fs.mkdirSync(path.dirname(destPath), { recursive: true })
	}

	const rel = await searchRelease({
		owner: "ragestudio",
		repo: "linebridge",
		prefix: "gateway-v",
	})

	const targetAsset = rel.assets.find((asset) => {
		if (asset.name.includes(`${platform}-${arch}`)) {
			return true
		}

		return false
	})

	if (!targetAsset) {
		throw new Error("Cannot find a valid binary for this machine")
	}

	console.log("Installing Gateway from release:", targetAsset)

	// download binary
	await downloadFile(targetAsset.browser_download_url, destPath)

	// fix permissions
	await fs.promises.chmod(destPath, 0o755)

	console.log("Successfully installed gateway binary")

	return destPath
}

export default installGateway
