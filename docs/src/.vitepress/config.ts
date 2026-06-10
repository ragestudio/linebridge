import { defineConfig } from "vitepress"
import { transformerTwoslash } from "@shikijs/vitepress-twoslash"
import lightbox from "vitepress-plugin-lightbox"

import nav from "./nav"
import sidebar from "./sidebar"

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
		["script", {}, "document.documentElement.classList.add('dark')"],
	],
	markdown: {
		theme: {
			dark: "github-dark",
			light: "github-light",
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
