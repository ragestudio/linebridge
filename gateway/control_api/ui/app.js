import { render } from "preact"
import { useCallback, useEffect, useMemo, useState } from "preact/hooks"
import { html } from "./html.js"
import { api, connectStream } from "./api.js"
import { createEmitter } from "./utils.js"
import { Badge, Button } from "./components/ui.js"
import Overview from "./components/Overview.js"
import Services from "./components/Services.js"
import ServiceDetail from "./components/ServiceDetail.js"
import Logs from "./components/Logs.js"
import WebSockets from "./components/WebSockets.js"
import Presence from "./components/Presence.js"
import Redis from "./components/Redis.js"

const ROUTES = [
	{ id: "overview", label: "Overview", glyph: "◈" },
	{ id: "services", label: "Services", glyph: "▤" },
	{ id: "logs", label: "Logs", glyph: "≡" },
	{ id: "websocket", label: "WebSocket", glyph: "◎" },
	{ id: "presence", label: "Presence", glyph: "◉" },
	{ id: "redis", label: "Redis", glyph: "⌘" },
]

function currentPath() {
	return location.hash.replace(/^#\/?/, "").split("?")[0]
}

function currentRoute() {
	const id = currentPath().split("/")[0]

	return ROUTES.some((route) => route.id === id) ? id : "overview"
}

// extra segment after the route, for example #/services/users
function currentParam() {
	const segments = currentPath().split("/").slice(1)

	return segments.length ? decodeURIComponent(segments.join("/")) : ""
}

function App() {
	const [route, setRoute] = useState(currentRoute)
	const [param, setParam] = useState(currentParam)
	const [snapshot, setSnapshot] = useState(null)
	const [health, setHealth] = useState(null)
	const [hello, setHello] = useState(null)
	const [streamStatus, setStreamStatus] = useState("connecting")

	const logBus = useMemo(() => createEmitter(), [])

	useEffect(() => {
		const onHashChange = () => {
			setRoute(currentRoute())
			setParam(currentParam())
		}
		window.addEventListener("hashchange", onHashChange)
		return () => window.removeEventListener("hashchange", onHashChange)
	}, [])

	useEffect(() => {
		document.title = `Linebridge Control · ${route}`
	}, [route])

	useEffect(() => {
		const stream = connectStream({
			onStatus: setStreamStatus,
			onEvent: (event) => {
				if (event.type === "hello") {
					setHello(event.data)
					setSnapshot({
						system: event.data.system,
						services: event.data.services || [],
					})
					return
				}

				if (event.type === "stats") {
					setSnapshot(event.data)
					return
				}

				if (event.type === "log") {
					logBus.emit(event.data)
				}
			},
		})

		return () => stream.close()
	}, [logBus])

	const refreshHealth = useCallback(async () => {
		try {
			setHealth(await api.health())
		} catch {
			// the stream status already reflects connectivity
		}
	}, [])

	const refreshSnapshot = useCallback(async () => {
		try {
			const [system, services] = await Promise.all([
				api.system(),
				api.services(),
			])
			setSnapshot({ system, services: services.services || [] })
		} catch {
			// keep the last snapshot
		}
	}, [])

	useEffect(() => {
		refreshHealth()
		const interval = setInterval(refreshHealth, 5000)
		return () => clearInterval(interval)
	}, [refreshHealth])

	useEffect(() => {
		if (streamStatus === "connected") return

		refreshSnapshot()
		const interval = setInterval(refreshSnapshot, 3000)
		return () => clearInterval(interval)
	}, [streamStatus, refreshSnapshot])

	const navigate = useCallback((path) => {
		const next = path.startsWith("/") ? path : `/${path}`
		location.hash = `#${next}`
		setRoute(currentRoute())
		setParam(currentParam())
	}, [])

	const services = snapshot?.services || []
	const running = services.filter((service) => service.running).length
	const websocket = snapshot?.system?.websocket || health?.websocket || {}
	const mode = hello?.mode || snapshot?.system?.mode || health?.mode || "dev"
	const version = hello?.version || health?.version || ""

	const streamTone =
		streamStatus === "connected"
			? "ok"
			: streamStatus === "connecting"
				? "warn"
				: "bad"

	let page = null

	if (route === "overview") {
		page = html`<${Overview}
			snapshot=${snapshot}
			health=${health}
			services=${services}
			navigate=${navigate}
		/>`
	} else if (route === "services") {
		page = param
			? html`<${ServiceDetail}
					id=${param}
					services=${services}
					refresh=${refreshSnapshot}
					navigate=${navigate}
				/>`
			: html`<${Services}
					services=${services}
					refresh=${refreshSnapshot}
					navigate=${navigate}
				/>`
	} else if (route === "logs") {
		page = html`<${Logs}
			logBus=${logBus}
			services=${services}
		/>`
	} else if (route === "websocket") {
		page = html`<${WebSockets} snapshot=${snapshot} />`
	} else if (route === "presence") {
		page = html`<${Presence} />`
	} else if (route === "redis") {
		page = html`<${Redis} health=${health} />`
	}

	return html`
		<div class="layout">
			<aside class="sidebar">
				<div class="brand">
					<span class="brand-mark">lb</span>
					<div>
						<strong>Control</strong>
						<div class="muted small">linebridge gateway</div>
					</div>
				</div>

				<nav class="nav">
					${ROUTES.map((item) => {
						let count = null

						if (item.id === "services")
							count = `${running}/${services.length}`
						if (item.id === "websocket")
							count = websocket.connections ?? 0

						return html`
							<button
								key=${item.id}
								class=${`nav-item ${route === item.id ? "active" : ""}`}
								onClick=${() => navigate(`/${item.id}`)}
							>
								<span class="nav-glyph">${item.glyph}</span>
								<span class="nav-label">${item.label}</span>
								${count !== null &&
								html`<span class="nav-count">${count}</span>`}
							</button>
						`
					})}
				</nav>

				<div class="sidebar-footer">
					<div class="row between">
						<span class="muted small">stream</span>
						<${Badge} tone=${streamTone}>${streamStatus}<//>
					</div>
					<div class="row between">
						<span class="muted small">mode</span>
						<span class="mono small">${mode}</span>
					</div>
					${version &&
					html`<div
						class="muted small ellipsis"
						title=${version}
					>
						${version}
					</div>`}
				</div>
			</aside>

			<main class="main">
				<div class="topbar">
					<div class="row">
						<span class="topbar-title"
							>${ROUTES.find((item) => item.id === route)
								?.label || "Overview"}${param &&
							html` <span class="muted">· ${param}</span>`}</span
						>
						${health &&
						html`<span class="muted small"
							>uptime ${Math.floor(health.uptime / 60)}m</span
						>`}
					</div>
					<div class="row">
						<span class="muted small"
							>${websocket.connections ?? 0} sockets ·
							${websocket.users ?? 0} users</span
						>
						<${Button}
							variant="ghost"
							onClick=${() => {
								refreshHealth()
								refreshSnapshot()
							}}
							>refresh<//
						>
					</div>
				</div>

				${page}
			</main>
		</div>
	`
}

render(html`<${App} />`, document.getElementById("app"))
