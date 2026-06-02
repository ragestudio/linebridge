import path from "node:path"
import fs from "node:fs"

interface RecursiveRegisterParams {
	start: string
	match: (filePath: string) => Promise<boolean> | boolean
	onMatch: (result: {
		absolutePath: string
		relativePath: string
	}) => Promise<any> | any
}

export default async ({
	start,
	match,
	onMatch,
}: RecursiveRegisterParams): Promise<void> => {
	const filterFrom = start.split("/").pop() ?? ""

	async function registerPath(_path: string): Promise<void> {
		const files = await fs.promises.readdir(_path)

		for await (const file of files) {
			const filePath = path.join(_path, file)

			const stat = await fs.promises.stat(filePath)

			if (stat.isDirectory()) {
				await registerPath(filePath)

				continue
			} else {
				const isMatch = await match(filePath)

				if (isMatch) {
					await onMatch({
						absolutePath: filePath,
						relativePath: filePath
							.split("/")
							.slice(filePath.split("/").indexOf(filterFrom) + 1)
							.join("/"),
					})
				}
			}
		}
	}

	await registerPath(start)
}
