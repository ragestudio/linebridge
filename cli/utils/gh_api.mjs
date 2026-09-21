import https from "https"

export function GHApi(path) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: "api.github.com",
			path,
			headers: {
				"User-Agent": "linebridge-cli",
				Accept: "application/vnd.github.v3+json",
			},
		}

		https
			.get(options, (res) => {
				let data = ""

				if (res.statusCode !== 200) {
					return reject(
						new Error(`API Error (${res.statusCode}) [${path}]`),
					)
				}

				res.on("data", (chunk) => (data += chunk))
				res.on("end", () => {
					try {
						resolve(JSON.parse(data))
					} catch (e) {
						reject(e)
					}
				})
			})
			.on("error", reject)
	})
}

export default GHApi
