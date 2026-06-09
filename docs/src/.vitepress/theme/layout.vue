<script setup lang="ts">
import {
	ref,
	nextTick,
	provide,
	onMounted,
	computed,
	defineAsyncComponent,
	Teleport,
} from "vue"
import { useData, useRouter } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"

import { File, Heart, Sparkles, Terminal } from "lucide-vue-next"
import mediumZoom from "medium-zoom"

import useDark from "./use-dark"

const isDark = useDark()
const { isDark: darkTheme } = useData()

const enableTransitions = () =>
	"startViewTransition" in document &&
	window.matchMedia("(prefers-reduced-motion: no-preference)").matches

provide("toggle-appearance", async ({ clientX: x, clientY: y }: MouseEvent) => {
	if (!enableTransitions() || !window?.localStorage) {
		darkTheme.value = !darkTheme.value
		return
	}

	const lastSwitch = window.localStorage.getItem("theme-switch")
	if (lastSwitch !== null && !isNaN(+lastSwitch)) {
		const lastSwitchTime = +lastSwitch

		if (Date.now() - lastSwitchTime > 3 * 60 * 1000) {
			if (document.documentElement.classList.contains("-animated"))
				document.documentElement.classList.remove("-animated")
		} else {
			document.documentElement.classList.add("-animated")
		}
	}

	window.localStorage.setItem("theme-switch", Date.now().toString())

	if (document.startViewTransition !== undefined)
		await document.startViewTransition(async () => {
			darkTheme.value = !darkTheme.value
			await nextTick()
		}).ready
})

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
}

onMounted(onNewPage)
</script>

<template>
	<DefaultTheme.Layout>
		<!-- <template #doc-top>
            <Ray
                class="h-[220px] top-0 left-0 opacity-25 dark:opacity-[.55] pointer-events-none"
                static
            />
        </template> -->
	</DefaultTheme.Layout>
</template>

<style>
:root {
	--switch-duration: 1.75s;
	--switch-name: scale;
}

.-animated {
	--switch-duration: 1s;
	--switch-name: scale-fast;
}

/* ::view-transition-old(root),
::view-transition-new(root) {
    animation: none;
    mix-blend-mode: normal;
}

::view-transition-old(root),
.dark::view-transition-new(root) {
    z-index: 1;
}

::view-transition-new(root),
.dark::view-transition-old(root) {
    z-index: 9999;
} */

.VPSwitchAppearance {
	width: 22px !important;
}

.VPSwitchAppearance .check {
	transform: none !important;
}

.medium-zoom-overlay {
	will-change: transform;
	backdrop-filter: blur(2.5rem) brightness(1.1);
	z-index: 998;
}

.medium-zoom-image {
	z-index: 999;
	-webkit-transform: translateZ(0);
	-webkit-backface-visibility: hidden;
	-webkit-transform-style: preserve-3d;
}

html.dark .medium-zoom-overlay {
	backdrop-filter: blur(2.5rem) brightness(0.85);
}

.medium-zoom-overlay,
.medium-zoom-image--opened {
	z-index: 999;
}
</style>
