import { pathToFileURL } from "node:url"
import path from "node:path"

const aliases = process.env.BOOT_ALIASES
	? JSON.parse(process.env.BOOT_ALIASES)
	: {}
const sortedAliases = Object.keys(aliases).sort((a, b) => b.length - a.length)

export async function resolve(specifier, context, nextResolve) {
	for (const alias of sortedAliases) {
		const targetPath = aliases[alias]

		if (specifier === alias) {
			return nextResolve(pathToFileURL(targetPath).href, context)
		}

		if (specifier.startsWith(alias + "/")) {
			const subPath = specifier.slice(alias.length + 1)
			const absolutePath = path.join(targetPath, subPath)
			return nextResolve(pathToFileURL(absolutePath).href, context)
		}
	}

	return nextResolve(specifier, context)
}
