import { defineConfig } from "vitepress"
import { transformerTwoslash } from "@shikijs/vitepress-twoslash"
import lightbox from "vitepress-plugin-lightbox"
import tailwindcss from "@tailwindcss/vite"
import vue from "@vitejs/plugin-vue"

import sidebar from "./sidebar"
import nav from "./nav"

export default defineConfig({
	title: "Linebridge",
	description:
		"Multiproposal framework to build fast, scalable, and secure servers",
	lang: "en-US",
	base: "/",
	head: [
		[
			"link",
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/logo_alt.svg",
			},
		],
	],
	markdown: {
		theme: {
			light: "github-light",
			dark: "github-dark",
		},
		codeTransformers: [transformerTwoslash()],
		languages: [
			"js",
			"ts",
			"javascript",
			"typescript",
			"jsx",
			"tsx",
			"prisma",
			"bash",
			"vue",
			"json",
			"yml",
		],
		config: (md) => {
			md.use(lightbox, {})
		},
	},
	buildEnd() {
		process.exit(0)
	},
	vite: {
		clearScreen: false,
		plugins: [tailwindcss()] as any,
		optimizeDeps: {
			exclude: [
				"@nolebase/vitepress-plugin-inline-link-preview/client",
				".vitepress/cache",
				"@rollup/browser",
			],
		},
		ssr: {
			noExternal: [
				"@nolebase/vitepress-plugin-inline-link-preview",
				"@nolebase/ui",
			],
		},
	},

	themeConfig: {
		logo: "/logo_alt.svg",

		nav: nav,
		sidebar: sidebar,

		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/ragestudio/linebridge",
			},
		],

		search: {
			provider: "local",
		},

		outline: {
			level: [2, 3],
		},
	},
})
