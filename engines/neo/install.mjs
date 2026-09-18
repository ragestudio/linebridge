import fs from "fs"
import path from "path"
import os from "os"
import https from "https"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const platform = os.platform()
const arch = os.arch()
const pkgJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
)

const REPO = "ragestudio/linebridge"
const VERSION = process.env.npm_package_version || pkgJson.version

const nodeMajor = process.versions.node.split(".")[0]
const BIN_NAME = `uws-wrapper-${platform}-${arch}-node${nodeMajor}.node`
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download/engine-neo-v${VERSION}/${BIN_NAME}`
const DEST_FILE = path.join(__dirname, "uws-wrapper.node")

function downloadBinary(url, dest) {
	return new Promise((resolve, reject) => {
		console.log(`Downloading binary [${url}]`)
		https
			.get(url, (res) => {
				if (res.statusCode === 302 || res.statusCode === 301) {
					return downloadBinary(res.headers.location, dest)
						.then(resolve)
						.catch(reject)
				}
				if (res.statusCode !== 200) {
					return reject(new Error(`status code: ${res.statusCode}`))
				}

				fs.mkdirSync(path.dirname(dest), { recursive: true })
				const file = fs.createWriteStream(dest)
				res.pipe(file)

				file.on("finish", () => {
					file.close()
					resolve()
				})
				file.on("error", (err) => {
					fs.unlink(dest, () => reject(err))
				})
			})
			.on("error", reject)
	})
}

async function main() {
	if (
		fs.existsSync(path.join(__dirname, ".experimental")) &&
		!process.argv.includes("--force")
	)
		return

	try {
		console.log("Downloading engine binary...", {
			url: DOWNLOAD_URL,
			dest: DEST_FILE,
		})
		await downloadBinary(DOWNLOAD_URL, DEST_FILE)
		console.log("Successfully downloaded pre-built binary.")
		process.exit(0)
	} catch (err) {
		console.error("❌ Failed to download engine binary:", err.message)
	}
}

main()
