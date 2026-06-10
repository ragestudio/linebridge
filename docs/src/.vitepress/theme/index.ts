import { type EnhanceAppContext, type Theme } from "vitepress"
import { createPinia } from "pinia"

import DefaultTheme from "vitepress/theme-without-fonts"
import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client"
// @ts-ignore
import Layout from "./layout.vue"

// @ts-ignore
import "@shikijs/vitepress-twoslash/style.css"
// @ts-ignore
import "../../style.less"

export default {
	extends: DefaultTheme,
	Layout: Layout,
	enhanceApp({ app }: EnhanceAppContext) {
		const pinia = createPinia()

		app.use(pinia)
		app.use(TwoslashFloatingVue)
	},
} satisfies Theme
