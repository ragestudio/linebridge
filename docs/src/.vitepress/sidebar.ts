import { DefaultTheme } from "vitepress/theme-without-fonts"

export default {
	"/guide/": [
		{
			text: "Introduction",
			collapsed: false,
			items: [
				{
					text: "Getting Started",
					link: "/guide/getting-started",
				},
				{ text: "Core Concepts", link: "/guide/core-concepts" },
			],
		},
		{
			text: "Fundamentals",
			collapsed: false,
			items: [
				{ text: "Server", link: "/guide/server" },
				{ text: "Routes & Handlers", link: "/guide/routes" },
				{ text: "WebSockets", link: "/guide/websockets" },
				{ text: "Middlewares", link: "/guide/middlewares" },
				{ text: "Context System", link: "/guide/contexts" },
				{
					text: "File-Based Routing",
					link: "/guide/file-based-routing",
				},
			],
		},
		{
			text: "Advanced",
			collapsed: false,
			items: [
				{ text: "Docker & Deployment", link: "/guide/docker" },
				{ text: "Linebridge Gateway", link: "/guide/gateway" },
				{ text: "IPC & NATS", link: "/guide/ipc-nats" },
				{ text: "Plugins", link: "/guide/plugins" },
			],
		},
	] as DefaultTheme.SidebarItem[],

	"/ultragateway/": [
		{
			text: "Ultragateway",
			items: [
				{ text: "Overview", link: "/ultragateway/" },
				{ text: "Installation", link: "/ultragateway/installation" },
				{ text: "Configuration", link: "/ultragateway/configuration" },
			],
		},
		{
			text: "Internals",
			items: [
				{ text: "Architecture", link: "/ultragateway/architecture" },
				{ text: "HTTP Routing", link: "/ultragateway/http-routing" },
				{ text: "WebSocket", link: "/ultragateway/websocket" },
				{ text: "IPC Protocol", link: "/ultragateway/ipc-protocol" },
				{ text: "Services", link: "/ultragateway/services" },
				{ text: "NATS Internals", link: "/ultragateway/nats" },
			],
		},
	] as DefaultTheme.SidebarItem[],

	"/api/": [
		{
			text: "Core Classes",
			items: [
				{ text: "Server", link: "/api/server" },
				{ text: "Route", link: "/api/route" },
				{ text: "Handler", link: "/api/handler" },
			],
		},
		{
			text: "Engine & Networking",
			items: [
				{ text: "EngineAdaptor", link: "/api/engine-adaptor" },
				{ text: "Neo Engine", link: "/api/neo-engine" },
				{
					text: "RTEngine (WebSockets)",
					link: "/api/rtengine",
				},
			],
		},
		{
			text: "Objects & Types",
			items: [
				{ text: "Request", link: "/api/request" },
				{ text: "Response", link: "/api/response" },
				{
					text: "OperationError",
					link: "/api/operation-error",
				},
			],
		},
		{
			text: "Distributed Systems",
			items: [
				{ text: "IPC", link: "/api/ipc" },
				{ text: "NATS Adapter", link: "/api/nats-adapter" },
				{ text: "NATS Client", link: "/api/nats-client" },
				{ text: "Gateway Config", link: "/api/gateway-config" },
			],
		},
		{
			text: "Utilities",
			items: [
				{
					text: "Compose Middlewares",
					link: "/api/compose-middlewares",
				},
				{
					text: "Recursive Register",
					link: "/api/recursive-register",
				},
				{
					text: "Register Aliases",
					link: "/api/register-aliases",
				},
				{ text: "NanoID", link: "/api/nanoid" },
			],
		},
	] as DefaultTheme.SidebarItem[],
}
