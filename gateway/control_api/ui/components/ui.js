import { html } from "../html.js"
import { formatPercent } from "../utils.js"

export function Card({ title, subtitle, actions, children, className = "" }) {
	const hasHeader = title || subtitle || actions

	return html`
		<section class=${`card ${className}`}>
			${hasHeader &&
			html`
				<header class="card-head">
					<div class="card-title">
						${title && html`<h2>${title}</h2>`}
						${subtitle &&
						html`<p class="muted small">${subtitle}</p>`}
					</div>
					${actions &&
					html`<div class="card-actions">${actions}</div>`}
				</header>
			`}
			<div class="card-body">${children}</div>
		</section>
	`
}

export function Badge({ tone = "muted", children, title }) {
	return html`<span
		class=${`badge badge-${tone}`}
		title=${title}
		>${children}</span
	>`
}

export function Stat({ label, value, hint }) {
	return html`
		<div class="stat">
			<span class="stat-label">${label}</span>
			<span class="stat-value">${value}</span>
			${hint && html`<span class="stat-hint">${hint}</span>`}
		</div>
	`
}

export function Progress({ value = 0, tone = "accent" }) {
	const safe = Math.max(0, Math.min(100, Number(value) || 0))

	return html`
		<div
			class="progress"
			title=${formatPercent(safe)}
		>
			<div
				class=${`progress-bar tone-${tone}`}
				style=${{ width: `${safe}%` }}
			></div>
		</div>
	`
}

export function Button({
	variant = "default",
	busy = false,
	disabled = false,
	children,
	onClick,
	title,
	className = "",
}) {
	return html`
		<button
			type="button"
			class=${`btn btn-${variant} ${className}`}
			disabled=${busy || disabled}
			onClick=${onClick}
			title=${title}
		>
			${busy ? "working…" : children}
		</button>
	`
}

export function Empty({ children }) {
	return html`<p class="empty">${children}</p>`
}

export function Loading({ label = "loading…" }) {
	return html`<p class="empty muted">${label}</p>`
}

export function ErrorBox({ error, onRetry }) {
	if (!error) return null

	return html`
		<div class="error-box">
			<span>${error}</span>
			${onRetry &&
			html`<${Button}
				variant="ghost"
				onClick=${onRetry}
				>retry<//
			>`}
		</div>
	`
}

export function PageHeader({ title, subtitle, actions }) {
	return html`
		<header class="page-head">
			<div>
				<h1>${title}</h1>
				${subtitle && html`<p class="muted">${subtitle}</p>`}
			</div>
			${actions && html`<div class="row">${actions}</div>`}
		</header>
	`
}

export function InlineField({ label, children }) {
	return html`
		<label class="inline-field">
			<span>${label}</span>
			${children}
		</label>
	`
}
