import { useEffect, useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import { Badge, Button, Card, Empty, ErrorBox, PageHeader } from "./ui.js"
import { formatDateTime, formatRelative, prettyJSON } from "../utils.js"

function formatTTL(milliseconds) {
	const value = Number(milliseconds)

	if (!Number.isFinite(value)) return "—"
	if (value === -1) return "no expiry"
	if (value === -2) return "missing"

	if (value < 1000) return `${value} ms`

	return `${Math.round(value / 1000)} s`
}

export default function Presence() {
	const [list, setList] = useState(null)
	const [selected, setSelected] = useState(null)
	const [detail, setDetail] = useState(null)
	const [query, setQuery] = useState("")
	const [error, setError] = useState(null)
	const [busy, setBusy] = useState(false)

	const loadList = async () => {
		try {
			setList(await api.presence())
		} catch (failure) {
			setError(failure.message)
		}
	}

	const inspect = async (userID) => {
		if (!userID) return

		setSelected(userID)
		setBusy(true)
		setError(null)

		try {
			setDetail(await api.presenceUser(userID))
		} catch (failure) {
			setError(failure.message)
			setDetail(null)
		} finally {
			setBusy(false)
		}
	}

	useEffect(() => {
		loadList()
		const interval = setInterval(loadList, 5000)
		return () => clearInterval(interval)
	}, [])

	useEffect(() => {
		if (selected) inspect(selected)
	}, [list?.count])

	const users = list?.users || []
	const enabled = Boolean(list?.enabled)
	const memory = detail?.memory
	const redis = detail?.redis

	return html`
		<div class="page">
			<${PageHeader}
				title="Presence"
				subtitle=${`${list?.count || 0} users connected to this gateway`}
				actions=${html`
					<${Badge} tone=${enabled ? "ok" : "muted"}
						>${enabled ? "presence on" : "presence off"}<//
					>
					<div class="input-group">
						<input
							class="input"
							placeholder="user id"
							value=${query}
							onInput=${(event) =>
								setQuery(event.currentTarget.value)}
							onKeyDown=${(event) => {
								if (event.key === "Enter") inspect(query.trim())
							}}
						/>
						<${Button}
							variant="ghost"
							busy=${busy}
							onClick=${() => inspect(query.trim())}
							>inspect<//
						>
					</div>
					<${Button}
						variant="ghost"
						onClick=${loadList}
						>refresh<//
					>
				`}
			/>

			<${ErrorBox}
				error=${error}
				onRetry=${() => loadList()}
			/>

			<div class="split">
				<${Card} title="Online users">
					${users.length === 0
						? html`<${Empty}>no users connected<//>`
						: html`
								<ul class="user-list">
									${users.map(
										(user) => html`
											<li
												key=${user.user_id}
												class=${`user-item ${selected === user.user_id ? "active" : ""}`}
												onClick=${() =>
													inspect(user.user_id)}
											>
												<div>
													<div class="mono">
														${user.user_id}
													</div>
													<div class="muted small">
														${user.sockets.join(
															", ",
														)}
													</div>
												</div>
												<${Badge} tone="ok"
													>${user.connections}<//
												>
											</li>
										`,
									)}
								</ul>
							`}
				<//>

				<${Card}
					title=${selected ? `User ${selected}` : "Inspector"}
					subtitle=${selected
						? "memory state and redis persistence"
						: "select a user or type an id"}
				>
					${!selected
						? html`<${Empty}>nothing selected<//>`
						: html`
								<div class="stack">
									<div class="row between">
										<h3>memory</h3>
										<${Badge}
											tone=${memory?.connected
												? "ok"
												: "muted"}
											>${memory?.connected
												? "connected"
												: "offline"}<//
										>
									</div>

									${memory?.sockets?.length
										? html`
												<table class="table compact">
													<thead>
														<tr>
															<th>socket</th>
															<th>connected</th>
															<th>last seen</th>
															<th>topics</th>
														</tr>
													</thead>
													<tbody>
														${memory.sockets.map(
															(socket) => html`
																<tr
																	key=${socket.socket_id}
																>
																	<td
																		class="mono"
																	>
																		${socket.socket_id}
																	</td>
																	<td>
																		${formatDateTime(
																			socket.connected_at,
																		)}
																	</td>
																	<td>
																		${formatRelative(
																			socket.last_seen,
																		)}
																	</td>
																	<td>
																		${socket
																			.topics
																			?.length ||
																		0}
																	</td>
																</tr>
															`,
														)}
													</tbody>
												</table>
											`
										: html`<p class="muted small">
												no live sockets in memory
											</p>`}

									<div class="row between">
										<h3>redis</h3>
										${redis?.error &&
										html`<${Badge} tone="bad">error<//>`}
									</div>

									${redis?.error
										? html`<p class="muted small">
												${redis.error}
											</p>`
										: !redis
											? html`<p class="muted small">
													${enabled
														? "redis is disabled"
														: "presence tracking is disabled"}
												</p>`
											: html`
													<div class="stats-grid">
														<div>
															<span
																class="muted small"
																>members</span
															>
															<div class="mono">
																${(
																	redis.members ||
																	[]
																).join(", ") ||
																"—"}
															</div>
														</div>
														<div>
															<span
																class="muted small"
																>user key
																ttl</span
															>
															<div class="mono">
																${formatTTL(
																	redis.user_ttl_ms,
																)}
															</div>
														</div>
														<div>
															<span
																class="muted small"
																>global
																score</span
															>
															<div class="mono">
																${redis.global_score ||
																0}
															</div>
														</div>
													</div>

													${redis.sockets &&
													Object.keys(redis.sockets)
														.length > 0
														? html`
																<table
																	class="table compact"
																>
																	<thead>
																		<tr>
																			<th>
																				socket
																			</th>
																			<th>
																				user
																			</th>
																			<th>
																				connected
																			</th>
																		</tr>
																	</thead>
																	<tbody>
																		${Object.entries(
																			redis.sockets,
																		).map(
																			([
																				socketID,
																				value,
																			]) => html`
																				<tr
																					key=${socketID}
																				>
																					<td
																						class="mono"
																					>
																						${socketID}
																					</td>
																					<td
																						class="mono"
																					>
																						${value?.user_id ||
																						"—"}
																					</td>
																					<td>
																						${formatDateTime(
																							value?.connected_at,
																						)}
																					</td>
																				</tr>
																			`,
																		)}
																	</tbody>
																</table>
															`
														: html`<p
																class="muted small"
															>
																no presence
																hashes
															</p>`}

													<details>
														<summary
															class="muted small"
														>
															raw redis payload
														</summary>
														<pre class="json">
${prettyJSON(redis)}</pre
														>
													</details>
												`}
								</div>
							`}
				<//>
			</div>
		</div>
	`
}
