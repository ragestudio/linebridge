export function compareSemver(tagA, tagB) {
	const parse = (tag) =>
		tag
			.replace(/^[^0-9]+/, "")
			.split(".")
			.map(Number)
	const a = parse(tagA)
	const b = parse(tagB)

	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const valA = a[i] || 0
		const valB = b[i] || 0

		if (valA > valB) return 1
		if (valA < valB) return -1
	}
	return 0
}

export default compareSemver
