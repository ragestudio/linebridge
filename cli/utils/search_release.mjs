import GHApi from "./gh_api.mjs"
import compareSemver from "./compare_semver.mjs"

export async function searchRelease({ owner, repo, prefix }) {
	const refsPath = `/repos/${owner}/${repo}/git/matching-refs/tags/${prefix}`
	const matchingRefs = await GHApi(refsPath)

	if (!Array.isArray(matchingRefs) || matchingRefs.length === 0) {
		throw new Error(`Cannot find tag with provided prefix "${prefix}"`)
	}

	const tags = matchingRefs.map((item) => item.ref.replace("refs/tags/", ""))

	tags.sort(compareSemver)
	const lastTag = tags[tags.length - 1]

	return await GHApi(`/repos/${owner}/${repo}/releases/tags/${lastTag}`)
}

export default searchRelease
