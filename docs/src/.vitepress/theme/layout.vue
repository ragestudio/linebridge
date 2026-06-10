<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from "vue"
import { useData, useRouter } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"
import { BookOpen, Code, Zap } from "@lucide/vue"
import mediumZoom from "medium-zoom"

const onNewPage = () => {
	mediumZoom("[data-zoomable]", {
		background: "transparent",
	})

	if (document.querySelector(".vp-doc > div:has(.code-compare)")) {
		document.getElementById("VPContent")?.classList.add("-wide")
		document.querySelector(".VPDoc > .container")?.classList.add("-wide")
		document.querySelector(".vp-doc > div")?.classList.add("-wide")
	} else {
		document.getElementById("VPContent")?.classList.remove("-wide")
		document.querySelector(".VPDoc > .container")?.classList.remove("-wide")
		document.querySelector(".vp-doc > div")?.classList.remove("-wide")
	}

	console.log("page")
}

onMounted(onNewPage)
</script>

<script lang="ts">
console.log("layout", document.querySelector(".VPDoc > .container"))
</script>

<template>
	<DefaultTheme.Layout>
		<template #home-hero-after>
			<div class="home-features-enhanced">
				<div class="feature-card">
					<div class="feature-icon">
						<Zap :size="28" />
					</div>
					<h3>Multiproposal</h3>
					<p>
						Handle HTTP, WebSocket, and custom protocols in a single unified
						server instance.
					</p>
				</div>
				<div class="feature-card">
					<div class="feature-icon">
						<Code :size="28" />
					</div>
					<h3>Type-Safe API</h3>
					<p>
						Full TypeScript support with automatic type inference for request
						handlers and responses.
					</p>
				</div>
				<div class="feature-card">
					<div class="feature-icon">
						<BookOpen :size="28" />
					</div>
					<h3>Modular Architecture</h3>
					<p>
						Extend functionality through a powerful plugin system without
						modifying core code.
					</p>
				</div>
			</div>
		</template>
	</DefaultTheme.Layout>
</template>

<style>
.medium-zoom-overlay {
	will-change: transform;
	backdrop-filter: blur(2.5rem) brightness(0.85);
	z-index: 998;
}

.medium-zoom-image {
	z-index: 999;
	-webkit-transform: translateZ(0);
	-webkit-backface-visibility: hidden;
	-webkit-transform-style: preserve-3d;
}

.medium-zoom-overlay,
.medium-zoom-image--opened {
	z-index: 999;
}

.home-features-enhanced {
	display: grid;
	grid-template-columns: repeat(1, 1fr);
	gap: 1.5rem;
	max-width: 960px;
	margin: 3rem auto 0;
	padding: 0 1.5rem;
}

@media (min-width: 640px) {
	.home-features-enhanced {
		grid-template-columns: repeat(3, 1fr);
	}
}

.feature-card {
	background-color: var(--vp-c-bg-elv);
	border: 1px solid var(--vp-c-border);
	border-radius: 0.75rem;
	padding: 1.5rem;
	transition: border-color 0.2s ease;
}

.feature-card:hover {
	border-color: var(--vp-c-brand-1);
}

.feature-icon {
	color: var(--vp-c-brand-1);
	margin-bottom: 1rem;
}

.feature-card h3 {
	font-size: 1.05rem;
	font-weight: 600;
	margin-bottom: 0.5rem;
	color: var(--vp-c-text-1);
}

.feature-card p {
	font-size: 0.875rem;
	line-height: 1.6;
	color: var(--vp-c-text-2);
}

.VPHero .action .VPButton::after {
	content: " \2192";
}

/* ======== Navbar icons ======== */
.VPNavBarMenuLink a,
.VPNavBarMenuGroup > .button {
	display: flex !important;
	align-items: center;
	gap: 0.375rem;
}

/* Version selector icon — GitBranch */
.VPNavBarMenuGroup > .button::before {
	content: "";
	display: inline-block;
	width: 14px;
	height: 14px;
	opacity: 0.7;
	background-color: var(--vp-c-brand-1);
	mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='6' x2='6' y1='3' y2='15'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cpath d='M18 9a9 9 0 0 1-9 9'/%3E%3C/svg%3E")
		no-repeat center;
	mask-size: contain;
	-webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='6' x2='6' y1='3' y2='15'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cpath d='M18 9a9 9 0 0 1-9 9'/%3E%3C/svg%3E")
		no-repeat center;
	-webkit-mask-size: contain;
}
</style>
