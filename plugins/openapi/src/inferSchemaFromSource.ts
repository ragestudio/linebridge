/**
 * Statically infers an OpenAPI-ish response schema from a route handler's
 * source code, by scanning `return { ... }` object literals.
 *
 * Conservative by design: only shapes it can read with confidence are
 * inferred (literals, nested objects, arrays, common ODM call patterns);
 * anything else becomes `{}` (free-form "any") or null when no object
 * literal return is found at all.
 */

const OPENERS = new Set(["{", "[", "("])
const CLOSERS: Record<string, string> = { "}": "{", "]": "[", ")": "(" }

/**
 * Starting at `start` (index of an opening brace in `src`), returns the
 * index just past the matching closing brace, or -1 if unbalanced.
 */
function matchBrace(src: string, start: number): number {
	let depth = 0
	let i = start
	let quote: string | null = null

	while (i < src.length) {
		const ch = src[i]

		if (quote) {
			if (ch === "\\") {
				i += 2
				continue
			}
			if (ch === quote) quote = null
			i++
			continue
		}

		if (ch === '"' || ch === "'" || ch === "`") {
			quote = ch
			i++
			continue
		}

		// skip line comments
		if (ch === "/" && src[i + 1] === "/") {
			while (i < src.length && src[i] !== "\n") i++
			continue
		}

		// skip block comments
		if (ch === "/" && src[i + 1] === "*") {
			i += 2
			while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
			i += 2
			continue
		}

		if (ch === "{") depth++
		if (ch === "}") {
			depth--
			if (depth === 0) return i + 1
		}

		i++
	}

	return -1
}

/** Splits an object literal body into top-level [key, expressionText] pairs */
function splitTopLevelProperties(body: string): Array<[string, string]> {
	const pairs: Array<[string, string]> = []
	const stack: string[] = []
	let quote: string | null = null
	let tokenStart = 0
	const segments: string[] = []

	let i = 0
	while (i < body.length) {
		const ch = body[i]

		if (quote) {
			if (ch === "\\") {
				i += 2
				continue
			}
			if (ch === quote) quote = null
			i++
			continue
		}

		if (ch === '"' || ch === "'" || ch === "`") {
			quote = ch
			i++
			continue
		}

		if (OPENERS.has(ch)) stack.push(ch)
		else if (
			stack.length > 0 &&
			CLOSERS[ch] === stack[stack.length - 1]
		)
			stack.pop()
		else if (ch === "," && stack.length === 0) {
			segments.push(body.slice(tokenStart, i))
			tokenStart = i + 1
		}

		i++
	}

	segments.push(body.slice(tokenStart))

	for (const segment of segments) {
		const match = segment.match(
			/^\s*(?:["'`]?([a-zA-Z_$][a-zA-Z0-9_$]*)["'`]?\s*:\s*)?([\s\S]*?)\s*$/,
		)

		if (!match) continue

		const [, key, expr] = match

		// spread `{ ...x }` or empty segment => skip, unknown shape
		if (expr === "" || expr.startsWith("...")) continue

		pairs.push([key ?? expr, expr])
	}

	return pairs
}

function inferFromExpression(expr: string): any {
	const trimmed = expr.trim()

	if (trimmed === "") return {}
	if (trimmed === "null") return { type: "null" }
	if (trimmed === "true" || trimmed === "false") return { type: "boolean" }
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return { type: "number" }
	if (trimmed.startsWith("`")) return { type: "string" }
	if (trimmed.startsWith('"') || trimmed.startsWith("'"))
		return { type: "string" }

	if (trimmed.startsWith("{")) {
		const end = matchBrace(trimmed, 0)
		if (end > 0) return inferFromObjectLiteral(trimmed.slice(1, end - 1))
		return { type: "object" }
	}

	if (trimmed.startsWith("[")) {
		// array literal: infer from first element if present
		const inner = trimmed.slice(1).trimStart()
		const items =
			inner.length > 0 && !inner.startsWith("]")
				? inferFromExpression(inner)
				: { type: "object" }
		return { type: "array", items }
	}

	// common ODM query patterns
	if (/\.find\(/.test(trimmed) && !/\.findOne\(/.test(trimmed)) {
		return { type: "array", items: { type: "object" } }
	}
	if (/\.map\(/.test(trimmed)) {
		return { type: "array", items: { type: "object" } }
	}
	if (/\.(findOne|findById|create|save|toJSON|toObject)\(/.test(trimmed)) {
		return { type: "object" }
	}
	if (/\.(count|countDocuments|length)\b/.test(trimmed)) {
		return { type: "number" }
	}

	// identifier, call, member access, ternary... unknown
	return {}
}

function inferFromObjectLiteral(body: string): any {
	const properties: Record<string, any> = {}

	for (const [key, expr] of splitTopLevelProperties(body)) {
		properties[key] = inferFromExpression(expr)
	}

	return { type: "object", properties }
}

/**
 * Scans handler source for `return` statements and infers a response shape:
 * - `return { ... }` object literals are merged (union of keys)
 * - other returns go through expression inference, resolving simple
 *   `const x = <expr>` assignments along the way
 */
export function inferSchemaFromSource(source: string): any | null {
	let merged: Record<string, any> | null = null

	const returnRegex = /return\s*\{/g
	let match: RegExpExecArray | null

	while ((match = returnRegex.exec(source)) !== null) {
		const braceIndex = returnRegex.lastIndex - 1
		const end = matchBrace(source, braceIndex)

		if (end < 0) continue

		const inferred = inferFromObjectLiteral(
			source.slice(braceIndex + 1, end - 1),
		)

		merged = { ...(merged ?? {}), ...inferred.properties }
	}

	if (merged && Object.keys(merged).length > 0) {
		return {
			type: "object",
			properties: merged,
			description: "Statically inferred from route source",
		}
	}

	// fallback: non-object-literal returns (`return bots`, `return x.map()`)
	const assignments = new Map<string, string>()

	for (const assignMatch of source.matchAll(
		/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;\n]+)/g,
	)) {
		assignments.set(assignMatch[1], assignMatch[2])
	}

	const typeVotes = new Set<string>()

	for (const returnMatch of source.matchAll(
		/return\s+([^;{}\n][^;\n]*)/g,
	)) {
		let expr = returnMatch[1].trim()

		// resolve simple identifiers through their assignment
		if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr) && assignments.has(expr)) {
			expr = assignments.get(expr)!
		}

		const inferred = inferFromExpression(expr)

		if (inferred.type) typeVotes.add(inferred.type)
	}

	if (typeVotes.has("array")) {
		return {
			type: "array",
			items: { type: "object" },
			description: "Statically inferred from route source",
		}
	}

	if (typeVotes.has("object")) {
		return {
			type: "object",
			description: "Statically inferred from route source",
		}
	}

	return null
}

export default inferSchemaFromSource
