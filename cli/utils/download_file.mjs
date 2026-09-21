import https from "node:https"
import fs from "node:fs"
import path from "node:path"

export function downloadBinary(url, dest) {
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

export default downloadBinary
