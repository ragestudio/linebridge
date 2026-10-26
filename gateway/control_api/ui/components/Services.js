import { useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import { Badge, Button, Card, Empty, ErrorBox, PageHeader } from "./ui.js"
import { formatBytes, formatDuration, formatPercent } from "../utils.js"

export default function Services({ services, refresh, navigate }) {
	const [busy, setBusy] = useState({})
	const [error, setError] = useState(null)
	const [filter, setFilter] = useState("")
	const list = services || []

	const run = async (service, action) => {
		setBusy((previous) => ({ ...previous, [service.id]: action }))
		setError(null)

		try {
			if (action === "start") await api.startService(service.id)
			if (action === "stop") await api.stopService(service.id)
			if (action === "restart") await api.restartService(service.id)

			await refresh()
		} catch (failure) {
			setError(failure.message)
		} finally {
			setBusy((previous) => {
				const next = { ...previous }
				delete next[service.id]
				return next
			})
		}
	}

	const needle = filter.trim().toLowerCase()
	const visible = needle
		? list.filter((service) => service.id.toLowerCase().includes(needle))
		: list
	const running = list.filter((service) => service.running).length

	return html`
		<div class="page">
			<${PageHeader}
				title="Services"
				subtitle=${`${running} running · ${list.length - running} stopped`}
				actions=${html`
					<input
						class="input"
						placeholder="filter services"
						value=${filter}
						onInput=${(event) =>
							setFilter(event.currentTarget.value)}
					/>
					<${Button}
						variant="ghost"
						onClick=${refresh}
						>refresh<//
					>
				`}
			/>

			<${ErrorBox} error=${error} />

			<${Card}>
				${visible.length === 0
					? html`<${Empty}>no services match this filter<//>`
					: html`
							<div class="table-wrap">
								<table class="table">
									<thead>
										<tr>
											<th>service</th>
											<th>status</th>
											<th>pid</th>
											<th>uptime</th>
											<th>starts</th>
											<th>cpu</th>
											<th>memory</th>
											<th>watch</th>
											<th class="right">actions</th>
										</tr>
									</thead>
									<tbody>
										${visible.map((service) => {
											const action = busy[service.id]

											return html`
												<tr key=${service.id}>
													<td>
														<button
															class="btn btn-link mono"
															title="inspect service"
															onClick=${() =>
																navigate(
																	`/services/${service.id}`,
																)}
														>
															${service.id}
														</button>
														<div
															class="muted small mono ellipsis"
															title=${service.cwd}
														>
															${service.cwd}
														</div>
													</td>
													<td>
														<${Badge}
															tone=${service.running
																? "ok"
																: "bad"}
															>${service.running
																? "running"
																: "stopped"}<//
														>
													</td>
													<td class="mono">
														${service.pid || "—"}
													</td>
													<td>
														${service.running
															? formatDuration(
																	service.uptime,
																)
															: "—"}
													</td>
													<td>
														${service.starts || 0}
													</td>
													<td>
														${formatPercent(
															service.cpu_percent,
														)}
													</td>
													<td>
														${formatBytes(
															service.memory_bytes,
														)}
													</td>
													<td>
														<${Badge}
															tone=${service.watcher
																? "accent"
																: "muted"}
															>${service.watcher
																? "on"
																: "off"}<//
														>
													</td>
													<td>
														<div class="actions">
															<${Button}
																variant="accent"
																onClick=${() =>
																	navigate(
																		`/services/${service.id}`,
																	)}
																>inspect<//
															>
															<${Button}
																variant="ghost"
																busy=${action ===
																"start"}
																disabled=${service.running ||
																Boolean(action)}
																onClick=${() =>
																	run(
																		service,
																		"start",
																	)}
																>start<//
															>
															<${Button}
																variant="ghost"
																busy=${action ===
																"stop"}
																disabled=${!service.running ||
																Boolean(action)}
																onClick=${() =>
																	run(
																		service,
																		"stop",
																	)}
																>stop<//
															>
															<${Button}
																variant="ghost"
																busy=${action ===
																"restart"}
																disabled=${Boolean(
																	action,
																)}
																onClick=${() =>
																	run(
																		service,
																		"restart",
																	)}
																>restart<//
															>
															<${Button}
																variant="link"
																onClick=${() =>
																	navigate(
																		`/logs?scope=${encodeURIComponent(`service:${service.id}`)}`,
																	)}
																>logs<//
															>
														</div>
													</td>
												</tr>
											`
										})}
									</tbody>
								</table>
							</div>
						`}
			<//>
		</div>
	`
}
