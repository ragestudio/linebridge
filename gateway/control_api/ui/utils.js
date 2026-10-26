export function formatBytes(value) {
	const number = Number(value) || 0

	if (number <= 0) return "0 B"

	const units = ["B", "KB", "MB", "GB", "TB"]
	let size = number
	let unit = 0

	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024
		unit++
	}

	const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2

	return `${size.toFixed(precision)} ${units[unit]}`
}

export function formatDuration(seconds) {
	const total = Math.max(0, Math.floor(Number(seconds) || 0))

	if (total === 0) return "0s"

	const days = Math.floor(total / 86400)
	const hours = Math.floor((total % 86400) / 3600)
	const minutes = Math.floor((total % 3600) / 60)
	const secs = total % 60
	const parts = []

	if (days) parts.push(`${days}d`)
	if (hours) parts.push(`${hours}h`)
	if (minutes) parts.push(`${minutes}m`)
	if (!days && !hours && secs) parts.push(`${secs}s`)

	return parts.join(" ")
}

export function formatPercent(value) {
	const number = Number(value) || 0
	return `${number.toFixed(1)}%`
}

export function formatTime(milliseconds) {
	const date = new Date(Number(milliseconds) || Date.now())
	const hours = String(date.getHours()).padStart(2, "0")
	const minutes = String(date.getMinutes()).padStart(2, "0")
	const seconds = String(date.getSeconds()).padStart(2, "0")
	const millis = String(date.getMilliseconds()).padStart(3, "0")

	return `${hours}:${minutes}:${seconds}.${millis}`
}

export function formatDateTime(seconds) {
	const value = Number(seconds)

	if (!value) return "—"

	return new Date(value * 1000).toLocaleString()
}

export function formatRelative(seconds) {
	const value = Number(seconds)

	if (!value) return "—"

	const delta = Math.max(0, Math.floor(Date.now() / 1000) - value)

	if (delta < 5) return "just now"
	if (delta < 60) return `${delta}s ago`
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`

	return `${Math.floor(delta / 86400)}d ago`
}

export function shortId(value, size = 10) {
	const text = String(value || "")
	return text.length > size ? `${text.slice(0, size)}…` : text
}

export function scopeLabel(scope) {
	if (!scope) return "gateway"
	return scope.startsWith("service:") ? scope.slice("service:".length) : scope
}

export function scopeHue(scope) {
	let hash = 0

	for (const character of String(scope || "gateway")) {
		hash = (hash * 31 + character.charCodeAt(0)) | 0
	}

	return Math.abs(hash) % 360
}

export function toneForPercent(value) {
	const number = Number(value) || 0

	if (number >= 90) return "bad"
	if (number >= 70) return "warn"

	return "accent"
}

export function createEmitter() {
	const listeners = new Set()

	return {
		on(listener) {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		emit(value) {
			for (const listener of listeners) {
				listener(value)
			}
		},
	}
}

export function prettyJSON(value) {
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}
