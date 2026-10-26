import { useEffect, useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import { Badge, Button, Card, Empty, ErrorBox, PageHeader } from "./ui.js"
import {
	formatDateTime,
	formatRelative,
	prettyJSON,
	shortId,
} from "../utils.js"

export default function WebSockets({ snapshot }) {
	const [data, setData] = useState(null)
	const [error, setError] = useState(null)
	const [filter, setFilter] = useState("")
	const [expanded, setExpanded] = useState(null)
	const [busy, setBusy] = useState(null)

	const load = async () => {
		try {
			setData(await api.websocket())
			setError(null)
		} catch (failure) {
			setError(failure.message)
		}
	}

	useEffect(() => {
		load()
		const interval = setInterval(load, 3000)
		return () => clearInterval(interval)
	}, [])

	const close = async (connection) => {
		if (!confirm(`close connection ${connection.socket_id}?`)) return

		setBusy(connection.socket_id)

		try {
			await api.closeConnection(connection.socket_id, {
				code: 1000,
				reason: "closed from control panel",
			})
			await load()
		} catch (failure) {
			setError(failure.message)
		} finally {
			setBusy(null)
		}
	}

	const connections = data?.connections || []
	const needle = filter.trim().toLowerCase()
	const visible = needle
		? connections.filter((connection) => {
				return (
					connection.socket_id.toLowerCase().includes(needle) ||
					String(connection.user_id || "")
						.toLowerCase()
						.includes(needle) ||
					String(connection.remote_addr || "")
						.toLowerCase()
						.includes(needle)
				)
			})
		: connections
	const websocketStats = snapshot?.system?.websocket || {}

	return html`
		<div class="page">
			<${PageHeader}
				title="WebSocket"
				subtitle=${`${data?.count ?? websocketStats.connections ?? 0} connections · ${data?.users ?? websocketStats.users ?? 0} users`}
				actions=${html`
					<input
						class="input"
						placeholder="socket, user or address"
						value=${filter}
						onInput=${(event) =>
							setFilter(event.currentTarget.value)}
					/>
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

			<${Card}>
				${visible.length === 0
					? html`<${Empty}>no websocket connections<//>`
					: html`
							<div class="table-wrap">
								<table class="table">
									<thead>
										<tr>
											<th>socket</th>
											<th>user</th>
											<th>auth</th>
											<th>connected</th>
											<th>last seen</th>
											<th>remote</th>
											<th>topics</th>
											<th class="right">actions</th>
										</tr>
									</thead>
									<tbody>
										${visible.map((connection) => {
											const isOpen =
												expanded ===
												connection.socket_id

											return html`
												<tr
													key=${connection.socket_id}
													class="clickable"
													onClick=${() =>
														setExpanded(
															isOpen
																? null
																: connection.socket_id,
														)}
												>
													<td
														class="mono"
														title=${connection.socket_id}
													>
														${shortId(
															connection.socket_id,
															12,
														)}
													</td>
													<td
														class="mono"
														title=${connection.user_id ||
														""}
													>
														${connection.user_id
															? shortId(
																	connection.user_id,
																	14,
																)
															: "—"}
													</td>
													<td>
														<${Badge}
															tone=${connection.authorized
																? "ok"
																: "muted"}
														>
															${connection.authorized
																? "yes"
																: "anonymous"}
														<//>
													</td>
													<td
														title=${formatDateTime(
															connection.connected_at,
														)}
													>
														${formatRelative(
															connection.connected_at,
														)}
													</td>
													<td>
														${formatRelative(
															connection.last_seen,
														)}
													</td>
													<td class="mono small">
														${connection.remote_addr ||
														"—"}
													</td>
													<td>
														${connection.topics
															?.length || 0}
													</td>
													<td>
														<div class="actions">
															<${Button}
																variant="ghost"
																onClick=${(
																	event,
																) => {
																	event.stopPropagation()
																	setExpanded(
																		isOpen
																			? null
																			: connection.socket_id,
																	)
																}}
															>
																${isOpen
																	? "hide"
																	: "inspect"}
															<//>
															<${Button}
																variant="danger"
																busy=${busy ===
																connection.socket_id}
																onClick=${(
																	event,
																) => {
																	event.stopPropagation()
																	close(
																		connection,
																	)
																}}
																>close<//
															>
														</div>
													</td>
												</tr>
												${isOpen &&
												html`
													<tr
														key=${`${connection.socket_id}-detail`}
														class="detail-row"
													>
														<td colspan=${8}>
															<div
																class="detail-grid"
															>
																<div>
																	<h3>
																		topics
																	</h3>
																	${connection
																		.topics
																		?.length
																		? html`<div
																				class="chips"
																			>
																				${connection.topics.map(
																					(
																						topic,
																					) =>
																						html`<span
																							class="chip"
																							key=${topic}
																							>${topic}</span
																						>`,
																				)}
																			</div>`
																		: html`<p
																				class="muted small"
																			>
																				no
																				topics
																			</p>`}
																</div>
																<div>
																	<h3>
																		meta
																	</h3>
																	<pre
																		class="json"
																	>
${prettyJSON(connection.meta || {})}</pre
																	>
																</div>
															</div>
														</td>
													</tr>
												`}
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
