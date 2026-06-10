<script setup lang="ts">
import {
	ref,
	nextTick,
	onMounted,
	computed,
	defineAsyncComponent,
	Teleport,
} from "vue"
import { useData, useRouter } from "vitepress"
import DefaultTheme from "vitepress/theme-without-fonts"

import { File, Heart, Sparkles, Terminal } from "lucide-vue-next"
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
}

onMounted(onNewPage)
</script>

<template>
	<DefaultTheme.Layout />
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
</style>
