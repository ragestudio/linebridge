/**
 * @fileoverview Recursively walks a directory tree, matching files against
 * a user-provided predicate, and calling a callback for each match.
 *
 * This utility powers both HTTP file-based routes and WebSocket file-based
 * events by scanning their respective directories and registering handlers.
 */

import path from "node:path"
import fs from "node:fs"

/** parameters for the recursive register function */
interface RecursiveRegisterParams {
	/** absolute path of the directory to start scanning from */
	start: string
	/** predicate function that returns true for files to process */
	match: (filePath: string) => Promise<boolean> | boolean
	/** callback invoked for each matching file, receives absolute and relative paths */
	onMatch: (result: {
		absolutePath: string
		relativePath: string
	}) => Promise<any> | any
}

/**
 * Traverses the directory tree rooted at `start`, calling `match` for each
 * file and `onMatch` for every file that `match` returns true for.
 *
 * @param options - configuration object with start, match, and onMatch
 */
export default async ({
	start,
	match,
	onMatch,
}: RecursiveRegisterParams): Promise<void> => {
	// extract the top-level directory name to compute relative paths later
	const filterFrom = start.split("/").pop() ?? ""

	/**
	 * Inner recursive function that reads a directory, processes matching
	 * files, and recurses into subdirectories.
	 *
	 * @param _path - the directory path currently being scanned
	 */
	async function registerPath(_path: string): Promise<void> {
		const files = await fs.promises.readdir(_path)

		for await (const file of files) {
			const filePath = path.join(_path, file)

			const stat = await fs.promises.stat(filePath)

			if (stat.isDirectory()) {
				// recurse into subdirectories
				await registerPath(filePath)

				continue
			} else {
				// check if this file matches the predicate
				const isMatch = await match(filePath)

				if (isMatch) {
					// compute the path relative to the starting directory
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

	// start recursion from the initial directory
	await registerPath(start)
}
