import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import { Badge, Button, Card, Empty, ErrorBox, PageHeader } from "./ui.js"
import { formatTime, scopeHue, scopeLabel } from "../utils.js"

const MAX_LINES = 2500
const RENDER_LIMIT = 1000

function scopeFromHash() {
	const query = location.hash.split("?")[1] || ""
	return new URLSearchParams(query).get("scope") || "all"
}

function writeScopeToHash(scope) {
	const hash =
		scope === "all" ? "#/logs" : `#/logs?scope=${encodeURIComponent(scope)}`
	history.replaceState(null, "", hash)
}

export default function Logs({ logBus, services }) {
	const [scope, setScope] = useState(scopeFromHash)
	const [lines, setLines] = useState([])
	const [paused, setPaused] = useState(false)
	const [autoscroll, setAutoscroll] = useState(true)
	const [filter, setFilter] = useState("")
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [dropped, setDropped] = useState(0)

	const scopeRef = useRef(scope)
	const pausedRef = useRef(paused)
	const pendingRef = useRef([])
	const listRef = useRef(null)

	useEffect(() => {
		scopeRef.current = scope
	}, [scope])

	useEffect(() => {
		pausedRef.current = paused
	}, [paused])

	const load = async (nextScope) => {
		setLoading(true)
		setError(null)
		pendingRef.current = []

		try {
			const payload = await api.logs(nextScope, 500)
			setLines(payload.lines || [])
			setDropped(payload.dropped || 0)
			writeScopeToHash(nextScope)
		} catch (failure) {
			setError(failure.message)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		load(scope)
	}, [scope])

	useEffect(() => {
		const dispose = logBus.on((line) => {
			if (pausedRef.current) return
			if (scopeRef.current !== "all" && line.scope !== scopeRef.current)
				return

			pendingRef.current.push(line)
		})

		const interval = setInterval(() => {
			if (pendingRef.current.length === 0) return

			const batch = pendingRef.current
			pendingRef.current = []

			setLines((previous) => {
				const next = previous.concat(batch)
				return next.length > MAX_LINES
					? next.slice(next.length - MAX_LINES)
					: next
			})
		}, 250)

		return () => {
			dispose()
			clearInterval(interval)
		}
	}, [logBus])

	const visible = useMemo(() => {
		const needle = filter.trim().toLowerCase()

		if (!needle) return lines

		return lines.filter((line) => {
			return (
				line.message.toLowerCase().includes(needle) ||
				line.scope.toLowerCase().includes(needle) ||
				String(line.stream || "")
					.toLowerCase()
					.includes(needle)
			)
		})
	}, [lines, filter])

	const rendered =
		visible.length > RENDER_LIMIT
			? visible.slice(visible.length - RENDER_LIMIT)
			: visible

	useEffect(() => {
		if (!autoscroll) return

		const element = listRef.current

		if (element) {
			element.scrollTop = element.scrollHeight
		}
	}, [rendered.length, autoscroll])

	const clear = async () => {
		try {
			await api.clearLogs()
			pendingRef.current = []
			setLines([])
		} catch (failure) {
			setError(failure.message)
		}
	}

	const download = () => {
		const text = visible
			.map(
				(line) =>
					`${formatTime(line.time)} [${line.scope}] ${line.message}`,
			)
			.join("\n")

		const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement("a")

		anchor.href = url
		anchor.download = `logs-${scope.replace(/[:/]/g, "_")}.txt`
		anchor.click()
		URL.revokeObjectURL(url)
	}

	const options = useMemo(() => {
		const values = new Set(["all", "gateway"])

		for (const service of services || []) {
			values.add(`service:${service.id}`)
		}

		if (scope !== "all") {
			values.add(scope)
		}

		return Array.from(values)
	}, [services, scope])

	return html`
		<div class="page page-fill">
			<${PageHeader}
				title="Logs"
				subtitle=${`${lines.length} buffered · ${rendered.length} rendered${dropped ? ` · ${dropped} dropped` : ""}`}
				actions=${html`
					<${Badge} tone=${paused ? "warn" : "ok"}
						>${paused ? "paused" : "live"}<//
					>
					<${Button}
						variant="ghost"
						onClick=${() => setPaused(!paused)}
						>${paused ? "resume" : "pause"}<//
					>
					<${Button}
						variant="ghost"
						onClick=${download}
						disabled=${visible.length === 0}
						>download<//
					>
					<${Button}
						variant="danger"
						onClick=${clear}
						>clear<//
					>
				`}
			/>

			<${ErrorBox}
				error=${error}
				onRetry=${() => load(scope)}
			/>

			<div class="log-toolbar">
				<label class="inline-field">
					<span>scope</span>
					<select
						class="input"
						value=${scope}
						onChange=${(event) =>
							setScope(event.currentTarget.value)}
					>
						${options.map(
							(option) => html`
								<option
									key=${option}
									value=${option}
								>
									${option === "all" ? "all scopes" : option}
								</option>
							`,
						)}
					</select>
				</label>

				<label class="inline-field grow">
					<span>filter</span>
					<input
						class="input"
						placeholder="message, scope or stream"
						value=${filter}
						onInput=${(event) =>
							setFilter(event.currentTarget.value)}
					/>
				</label>

				<label class="checkbox">
					<input
						type="checkbox"
						checked=${autoscroll}
						onChange=${(event) =>
							setAutoscroll(event.currentTarget.checked)}
					/>
					<span>autoscroll</span>
				</label>
			</div>

			<${Card} className="logs-card">
				${loading
					? html`<${Empty}>loading logs…<//>`
					: rendered.length === 0
						? html`<${Empty}>no log lines for this scope<//>`
						: html`
								<div
									class="log-list"
									ref=${listRef}
								>
									${rendered.map(
										(line, index) => html`
											<div
												class=${`log-line ${line.stream || ""}`}
												key=${`${line.time}-${index}`}
											>
												<span class="log-time"
													>${formatTime(
														line.time,
													)}</span
												>
												<span
													class="log-scope"
													style=${{
														color: `hsl(${scopeHue(line.scope)} 70% 72%)`,
													}}
												>
													${scopeLabel(line.scope)}
												</span>
												${line.stream === "stderr" &&
												html`<span
													class="log-stream stream-err"
													>err</span
												>`}
												${line.stream === "system" &&
												html`<span
													class="log-stream stream-sys"
													>sys</span
												>`}
												<span class="log-message"
													>${line.message}</span
												>
											</div>
										`,
									)}
								</div>
							`}
			<//>
		</div>
	`
}
