import { useEffect, useMemo, useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import {
	Badge,
	Button,
	Card,
	Empty,
	ErrorBox,
	Loading,
	PageHeader,
	Stat,
} from "./ui.js"
import {
	formatBytes,
	formatDateTime,
	formatDuration,
	formatPercent,
	prettyJSON,
} from "../utils.js"

const REFRESH_MS = 3000

function groupRoutes(routes) {
	const groups = {}

	for (const route of routes || []) {
		const method = route.method || "ANY"

		if (!groups[method]) {
			groups[method] = []
		}

		groups[method].push(route.path)
	}

	return Object.entries(groups).sort(([left], [right]) =>
		left.localeCompare(right),
	)
}

function toneForMethod(method) {
	if (method === "GET") return "accent"
	if (method === "POST") return "ok"
	if (method === "DELETE") return "bad"
	if (method === "PUT" || method === "PATCH") return "warn"

	return "muted"
}

export default function ServiceDetail({ id, services, refresh, navigate }) {
	const [data, setData] = useState(null)
	const [error, setError] = useState(null)
	const [busy, setBusy] = useState(null)
	const [envFilter, setEnvFilter] = useState("")
	const [showRaw, setShowRaw] = useState(false)

	const load = async () => {
		try {
			setData(await api.serviceDetail(id))
			setError(null)
		} catch (failure) {
			setError(failure.message)
		}
	}

	useEffect(() => {
		setData(null)
		load()
	}, [id])

	useEffect(() => {
		const interval = setInterval(load, REFRESH_MS)
		return () => clearInterval(interval)
	}, [id])

	useEffect(() => {
		const listed = (services || []).find((service) => service.id === id)
		document.title = `Linebridge Control · ${listed ? id : "services"}`
	}, [id, services])

	const run = async (action) => {
		setBusy(action)
		setError(null)

		try {
			if (action === "start") await api.startService(id)
			if (action === "stop") await api.stopService(id)
			if (action === "restart") await api.restartService(id)

			await Promise.all([load(), refresh()])
		} catch (failure) {
			setError(failure.message)
		} finally {
			setBusy(null)
		}
	}

	const routes = useMemo(() => groupRoutes(data?.routes), [data])
	const needle = envFilter.trim().toLowerCase()
	const env = useMemo(() => {
		const entries = data?.env || []

		if (!needle) return entries

		return entries.filter((entry) =>
			entry.key.toLowerCase().includes(needle),
		)
	}, [data, needle])

	const wsEvents = data?.ws_events || []
	const natsEvents = data?.nats_events || []
	const httpPrefixes = data?.http_prefixes || []
	const registration = data?.registration || null
	const running = Boolean(data?.running)

	return html`
		<div class="page">
			<${PageHeader}
				title=${id}
				subtitle=${data
					? data.cwd || data.main_path
					: "service inspector"}
				actions=${html`
					<${Button}
						variant="ghost"
						onClick=${() => navigate("/services")}
						>back<//
					>
					<${Button}
						variant="ghost"
						busy=${busy === "start"}
						disabled=${running || Boolean(busy)}
						onClick=${() => run("start")}
						>start<//
					>
					<${Button}
						variant="ghost"
						busy=${busy === "stop"}
						disabled=${!running || Boolean(busy)}
						onClick=${() => run("stop")}
						>stop<//
					>
					<${Button}
						variant="ghost"
						busy=${busy === "restart"}
						disabled=${Boolean(busy)}
						onClick=${() => run("restart")}
						>restart<//
					>
					<${Button}
						variant="ghost"
						onClick=${() =>
							navigate(
								`/logs?scope=${encodeURIComponent(`service:${id}`)}`,
							)}
						>logs<//
					>
					<${Button}
						variant="ghost"
						onClick=${load}
						>refresh<//
					>
				`}
			/>

			<${ErrorBox}
				error=${error}
				onRetry=${load}
			/>

			${!data && !error
				? html`<${Loading} label="loading service…" />`
				: data &&
					html`
						<${Card}
							title="Process"
							subtitle=${data.main_path}
							actions=${html`
								<${Badge} tone=${running ? "ok" : "bad"}
									>${running ? "running" : "stopped"}<//
								>
								${data.watcher &&
								html`<${Badge} tone="accent">watcher<//>`}
							`}
						>
							<div class="stats-grid">
								<${Stat}
									label="pid"
									value=${data.pid || "—"}
									hint=${`starts ${data.starts || 0}`}
								/>
								<${Stat}
									label="uptime"
									value=${running
										? formatDuration(data.uptime)
										: "—"}
									hint=${formatDateTime(data.started_at)}
								/>
								<${Stat}
									label="cpu"
									value=${formatPercent(data.cpu_percent)}
									hint=${`${data.threads || 0} threads`}
								/>
								<${Stat}
									label="memory"
									value=${formatBytes(data.memory_bytes)}
								/>
								<${Stat}
									label="log lines"
									value=${data.log_lines ?? 0}
									hint="in memory buffer"
								/>
								<${Stat}
									label="socket"
									value=${html`<span
										class="mono small ellipsis"
										title=${data.socket || ""}
										>${data.socket || "tcp"}</span
									>`}
								/>
							</div>
						<//>

						<div class="split">
							<${Card}
								title="HTTP routes"
								subtitle=${`${data.routes?.length || 0} registered`}
							>
								${routes.length === 0
									? html`<${Empty}>no routes advertised<//>`
									: html`
											<div class="stack">
												${routes.map(
													([method, paths]) => html`
														<div key=${method}>
															<div class="row">
																<${Badge}
																	tone=${toneForMethod(
																		method,
																	)}
																	>${method}<//
																>
																<span
																	class="muted small"
																	>${paths.length}</span
																>
															</div>
															<div
																class="chips"
																style=${{
																	marginTop:
																		"6px",
																}}
															>
																${paths.map(
																	(
																		path,
																	) => html`
																		<span
																			class="chip"
																			key=${`${method}:${path}`}
																			title=${path}
																			>${path}</span
																		>
																	`,
																)}
															</div>
														</div>
													`,
												)}
											</div>
										`}
								${httpPrefixes.length > 0 &&
								html`
									<h3 style=${{ marginTop: "16px" }}>
										gateway prefixes
									</h3>
									<div class="chips">
										${httpPrefixes.map(
											(prefix) =>
												html`<span
													class="chip"
													key=${prefix}
													>${prefix}</span
												>`,
										)}
									</div>
								`}
							<//>

							<${Card}
								title="WebSocket"
								subtitle=${registration?.ws_path || ""}
							>
								<div
									class="row"
									style=${{ marginBottom: "10px" }}
								>
									<${Badge}
										tone=${registration?.ws_enabled
											? "ok"
											: "muted"}
										>${registration?.ws_enabled
											? "enabled"
											: "disabled"}<//
									>
								</div>

								<h3>handled events</h3>
								${wsEvents.length
									? html`<div class="chips">
											${wsEvents.map(
												(event) =>
													html`<span
														class="chip"
														key=${event}
														>${event}</span
													>`,
											)}
										</div>`
									: html`<${Empty}>no events advertised<//>`}

								<h3 style=${{ marginTop: "16px" }}>
									nats routing
								</h3>
								${natsEvents.length
									? html`<div class="chips">
											${natsEvents.map(
												(event) =>
													html`<span
														class="chip"
														key=${`nats:${event}`}
														>${event}</span
													>`,
											)}
										</div>`
									: html`<${Empty}>no events registered<//>`}
							<//>
						</div>

						<${Card}
							title="Environment"
							subtitle=${`${data.env?.length || 0} variables`}
							actions=${html`
								<input
									class="input"
									placeholder="filter variables"
									value=${envFilter}
									onInput=${(event) =>
										setEnvFilter(event.currentTarget.value)}
								/>
							`}
						>
							${env.length === 0
								? html`<${Empty}>no variables<//>`
								: html`
										<div class="table-wrap scroll">
											<table class="table compact">
												<thead>
													<tr>
														<th>key</th>
														<th>value</th>
													</tr>
												</thead>
												<tbody>
													${env.map(
														(entry) => html`
															<tr
																key=${entry.key}
															>
																<td
																	class="mono"
																>
																	${entry.key}
																</td>
																<td
																	class="mono small value-cell"
																	title=${entry.value}
																>
																	${entry.redacted
																		? html`<${Badge}
																				tone="warn"
																				>redacted<//
																			>`
																		: entry.value}
																</td>
															</tr>
														`,
													)}
												</tbody>
											</table>
										</div>
									`}
						<//>

						<${Card}
							title="Registration payload"
							subtitle="raw message sent by the service over the ipc socket"
							actions=${html`
								<${Button}
									variant="ghost"
									onClick=${() => setShowRaw(!showRaw)}
									>${showRaw ? "hide" : "show"}<//
								>
							`}
						>
							${registration
								? showRaw
									? html`<pre class="json tall">
											${prettyJSON(registration)}</pre
										>`
									: html`<p class="muted small">
											registered
											${formatDateTime(
												registration.registered_at,
											)}
											·
											${registration.http_proto}://${registration.ip ||
											"127.0.0.1"}:${registration.port}
										</p>`
								: html`<${Empty}
										>the service has not registered yet<//
									>`}
						<//>
					`}
		</div>
	`
}
