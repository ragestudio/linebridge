import { useEffect, useState } from "preact/hooks"
import { html } from "../html.js"
import { api } from "../api.js"
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Stat } from "./ui.js"
import { formatDuration, prettyJSON } from "../utils.js"

function keyCommand(type, key) {
	switch (type) {
		case "string":
			return ["GET", [key]]
		case "hash":
			return ["HGETALL", [key]]
		case "set":
			return ["SMEMBERS", [key]]
		case "zset":
			return ["ZRANGE", [key, "0", "50", "WITHSCORES"]]
		case "list":
			return ["LRANGE", [key, "0", "50"]]
		case "stream":
			return ["XLEN", [key]]
		default:
			return null
	}
}

function formatTTL(ttl) {
	if (ttl === -1) return "persistent"
	if (ttl === -2) return "missing"
	if (ttl <= 0) return "—"

	return formatDuration(ttl)
}

export default function Redis({ health }) {
	const disabled = health?.redis?.enabled === false

	const [info, setInfo] = useState(null)
	const [infoError, setInfoError] = useState(null)
	const [pattern, setPattern] = useState("presence:*")
	const [limit, setLimit] = useState(100)
	const [keys, setKeys] = useState(null)
	const [keysError, setKeysError] = useState(null)
	const [selectedKey, setSelectedKey] = useState(null)
	const [value, setValue] = useState(null)
	const [valueError, setValueError] = useState(null)
	const [busyKey, setBusyKey] = useState(null)
	const [command, setCommand] = useState("")
	const [args, setArgs] = useState("")
	const [commandResult, setCommandResult] = useState(null)
	const [commandError, setCommandError] = useState(null)
	const [busyCommand, setBusyCommand] = useState(false)

	const loadInfo = async () => {
		try {
			setInfo(await api.redisInfo())
			setInfoError(null)
		} catch (failure) {
			setInfoError(failure.message)
		}
	}

	const loadKeys = async () => {
		try {
			setKeys(await api.redisKeys(pattern, limit))
			setKeysError(null)
		} catch (failure) {
			setKeysError(failure.message)
		}
	}

	useEffect(() => {
		if (disabled) return
		loadInfo()
		loadKeys()
	}, [disabled])

	const inspect = async (entry) => {
		const commandSpec = keyCommand(entry.type, entry.key)

		if (!commandSpec) return

		setSelectedKey(entry)
		setBusyKey(entry.key)
		setValueError(null)

		try {
			const payload = await api.redisExec(commandSpec[0], commandSpec[1])
			setValue(payload.result)
		} catch (failure) {
			setValueError(failure.message)
			setValue(null)
		} finally {
			setBusyKey(null)
		}
	}

	const runCommand = async () => {
		if (!command.trim()) return

		setBusyCommand(true)
		setCommandError(null)
		setCommandResult(null)

		try {
			const parsedArgs = args.trim() ? args.trim().split(/\s+/) : []
			const payload = await api.redisExec(command.trim(), parsedArgs)
			setCommandResult(payload.result)
		} catch (failure) {
			setCommandError(failure.message)
		} finally {
			setBusyCommand(false)
		}
	}

	const summary = info?.summary || {}
	const keyList = keys?.keys || []

	if (disabled) {
		return html`
			<div class="page">
				<${PageHeader}
					title="Redis"
					subtitle="persistence inspector"
				/>
				<${Card}
					><${Empty}>redis is disabled in gateway.config.json<//><//
				>
			</div>
		`
	}

	return html`
		<div class="page">
			<${PageHeader}
				title="Redis"
				subtitle=${`${info?.dbsize ?? "—"} keys · ping ${info?.ping_ms?.toFixed?.(2) ?? "—"} ms`}
				actions=${html`<${Button}
					variant="ghost"
					onClick=${() => {
						loadInfo()
						loadKeys()
					}}
					>refresh<//
				>`}
			/>

			<${ErrorBox}
				error=${infoError}
				onRetry=${loadInfo}
			/>

			<div class="cards">
				<${Card} title="Server">
					<${Stat}
						label="version"
						value=${summary.redis_version ||
						summary.dragonfly_version ||
						"unknown"}
						hint=${`${summary.connected_clients || 0} clients`}
					/>
					<${Stat}
						label="memory"
						value=${summary.used_memory_human || "—"}
						hint=${summary.used_memory_peak_human
							? `peak ${summary.used_memory_peak_human}`
							: ""}
					/>
				<//>

				<${Card} title="Traffic">
					<${Stat}
						label="commands/sec"
						value=${summary.instantaneous_ops_per_sec || "0"}
						hint=${`${summary.total_commands_processed || 0} total`}
					/>
					<${Stat}
						label="hits / misses"
						value=${`${summary.keyspace_hits || 0} / ${summary.keyspace_misses || 0}`}
					/>
				<//>

				<${Card} title="Keyspace">
					${Object.keys(summary).filter((key) => key.startsWith("db"))
						.length === 0
						? html`<p class="muted small">empty</p>`
						: Object.keys(summary)
								.filter((key) => key.startsWith("db"))
								.map(
									(db) => html`
										<div
											class="mono small"
											key=${db}
										>
											${db}: ${summary[db]}
										</div>
									`,
								)}
				<//>
			</div>

			<div class="split">
				<${Card}
					title="Keys"
					actions=${html`
						<div class="input-group">
							<input
								class="input"
								value=${pattern}
								onInput=${(event) =>
									setPattern(event.currentTarget.value)}
							/>
							<input
								class="input input-small"
								type="number"
								min="1"
								max="500"
								value=${limit}
								onInput=${(event) =>
									setLimit(
										Number(event.currentTarget.value) ||
											100,
									)}
							/>
							<${Button}
								variant="ghost"
								onClick=${loadKeys}
								>scan<//
							>
						</div>
					`}
				>
					<${ErrorBox}
						error=${keysError}
						onRetry=${loadKeys}
					/>

					${keyList.length === 0
						? html`<${Empty}>no keys match this pattern<//>`
						: html`
								<div class="table-wrap scroll">
									<table class="table compact">
										<thead>
											<tr>
												<th>key</th>
												<th>type</th>
												<th>ttl</th>
												<th>size</th>
											</tr>
										</thead>
										<tbody>
											${keyList.map(
												(entry) => html`
													<tr
														key=${entry.key}
														class=${`clickable ${selectedKey?.key === entry.key ? "active" : ""}`}
														onClick=${() =>
															inspect(entry)}
													>
														<td
															class="mono ellipsis"
															title=${entry.key}
														>
															${entry.key}
														</td>
														<td>
															<${Badge}
																tone="accent"
																>${entry.type}<//
															>
														</td>
														<td>
															${formatTTL(
																entry.ttl,
															)}
														</td>
														<td>
															${entry.length ?? 0}
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
					title=${selectedKey
						? `Value · ${selectedKey.key}`
						: "Value"}
					subtitle=${selectedKey
						? `${selectedKey.type} · ttl ${formatTTL(selectedKey.ttl)}`
						: "select a key to inspect it"}
				>
					${!selectedKey
						? html`<${Empty}>nothing selected<//>`
						: busyKey
							? html`<${Empty}>loading…<//>`
							: html`
									<${ErrorBox} error=${valueError} />
									<pre class="json tall">
${prettyJSON(value)}</pre
									>
								`}
				<//>
			</div>

			<${Card}
				title="Console"
				subtitle="read commands are allowed, destructive admin commands are blocked"
			>
				<div class="input-group">
					<input
						class="input input-command"
						placeholder="HGETALL"
						value=${command}
						onInput=${(event) =>
							setCommand(event.currentTarget.value)}
					/>
					<input
						class="input"
						placeholder="args separated by spaces"
						value=${args}
						onInput=${(event) => setArgs(event.currentTarget.value)}
					/>
					<${Button}
						variant="accent"
						busy=${busyCommand}
						onClick=${runCommand}
						>run<//
					>
				</div>

				<${ErrorBox} error=${commandError} />

				${commandResult !== null &&
				html`<pre class="json tall">${prettyJSON(commandResult)}</pre>`}
			<//>

			<details>
				<summary class="muted small">raw INFO output</summary>
				<pre class="json tall">${info?.info || ""}</pre>
			</details>
		</div>
	`
}
