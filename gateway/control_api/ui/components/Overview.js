import { html } from "../html.js"
import { Badge, Button, Card, Empty, PageHeader, Progress, Stat } from "./ui.js"
import {
	formatBytes,
	formatDuration,
	formatPercent,
	toneForPercent,
} from "../utils.js"

export default function Overview({ snapshot, health, services, navigate }) {
	const system = snapshot?.system

	if (!system) {
		return html`
			<div class="page">
				<${PageHeader}
					title="Overview"
					subtitle="waiting for the gateway stream…"
				/>
				<${Card}><${Empty}>the control stream is connecting<//><//>
			</div>
		`
	}

	const host = system.host || {}
	const gateway = system.gateway || {}
	const runtime = system.runtime || {}
	const websocket = system.websocket || {}
	const summary = system.services || {}
	const list = services || []
	const running = list.filter((service) => service.running)
	const stopped = list.filter((service) => !service.running)
	const hostMemoryUsed = (host.memory_total || 0) - (host.memory_free || 0)

	return html`
		<div class="page">
			<${PageHeader}
				title="Overview"
				subtitle=${`${system.mode || "dev"} · ${health ? formatDuration(health.uptime) : "…"}`}
				actions=${html`
					<${Badge} tone=${health?.nats?.connected ? "ok" : "bad"}
						>nats ${health?.nats?.connected ? "up" : "down"}<//
					>
					<${Badge}
						tone=${health?.redis?.enabled
							? health.redis.connected
								? "ok"
								: "bad"
							: "muted"}
					>
						redis
						${health?.redis?.enabled
							? health.redis.connected
								? "up"
								: "down"
							: "off"}
					<//>
				`}
			/>

			<div class="cards">
				<${Card} title="Host cpu">
					<${Stat}
						label="usage"
						value=${formatPercent(host.cpu_percent)}
						hint=${`load ${Number(host.load1 || 0).toFixed(2)} / ${Number(host.load5 || 0).toFixed(2)} / ${Number(host.load15 || 0).toFixed(2)}`}
					/>
					<${Progress}
						value=${host.cpu_percent}
						tone=${toneForPercent(host.cpu_percent)}
					/>
				<//>

				<${Card} title="Host memory">
					<${Stat}
						label="used"
						value=${formatBytes(hostMemoryUsed)}
						hint=${`of ${formatBytes(host.memory_total)}`}
					/>
					<${Progress}
						value=${host.memory_percent}
						tone=${toneForPercent(host.memory_percent)}
					/>
				<//>

				<${Card} title="Gateway process">
					<${Stat}
						label="cpu"
						value=${formatPercent(gateway.cpu_percent)}
						hint=${`pid ${gateway.pid} · ${gateway.threads} threads`}
					/>
					<${Stat}
						label="resident memory"
						value=${formatBytes(gateway.memory)}
						hint=${`${gateway.goroutines} goroutines · up ${formatDuration(gateway.uptime)}`}
					/>
				<//>

				<${Card} title="Connections">
					<${Stat}
						label="websocket"
						value=${websocket.connections || 0}
						hint=${`${websocket.users || 0} users`}
					/>
					<${Stat}
						label="services"
						value=${`${summary.running || 0}/${summary.total || 0}`}
						hint=${`${stopped.length} stopped`}
					/>
				<//>

				<${Card} title="Go runtime">
					<${Stat}
						label="heap"
						value=${formatBytes(runtime.heap_inuse)}
						hint=${`alloc ${formatBytes(runtime.heap_alloc)} · sys ${formatBytes(runtime.heap_sys)}`}
					/>
					<${Stat}
						label="gc"
						value=${runtime.num_gc || 0}
						hint=${`avg ${(runtime.avg_gc_ms || 0).toFixed(2)} ms · ${runtime.gomaxprocs} procs`}
					/>
				<//>

				<${Card} title="Shortcuts">
					<div class="stack">
						<${Button}
							variant="ghost"
							onClick=${() => navigate("/logs")}
							>open logs<//
						>
						<${Button}
							variant="ghost"
							onClick=${() => navigate("/websocket")}
							>websocket inspector<//
						>
						<${Button}
							variant="ghost"
							onClick=${() => navigate("/presence")}
							>presence debug<//
						>
						<${Button}
							variant="ghost"
							onClick=${() => navigate("/redis")}
							>redis explorer<//
						>
					</div>
				<//>
			</div>

			<${Card}
				title="Services"
				subtitle=${`${running.length} running · ${stopped.length} stopped`}
				actions=${html`<${Button}
					variant="ghost"
					onClick=${() => navigate("/services")}
					>view all<//
				>`}
			>
				${list.length === 0
					? html`<${Empty}>no services discovered<//>`
					: html`
							<table class="table compact">
								<thead>
									<tr>
										<th>service</th>
										<th>status</th>
										<th>pid</th>
										<th>uptime</th>
										<th>memory</th>
									</tr>
								</thead>
								<tbody>
									${list.slice(0, 8).map(
										(service) => html`
											<tr
												key=${service.id}
												class="clickable"
												onClick=${() =>
													navigate(
														`/logs?scope=${encodeURIComponent(`service:${service.id}`)}`,
													)}
											>
												<td class="mono">
													${service.id}
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
													${formatBytes(
														service.memory_bytes,
													)}
												</td>
											</tr>
										`,
									)}
								</tbody>
							</table>
						`}
			<//>
		</div>
	`
}
