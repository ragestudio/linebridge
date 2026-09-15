import type Stream from "stream"

import "@linebridge/bootloader"
import { Server } from "linebridge/dist/server"
import LiveDirectory from "live-directory"

class DocsServer extends Server {
	static baseRoutes = false
	static useMiddlewares = ["logs", "cors"]

	routes = {
		"/*": {
			method: "get",
			fn: async (req, res) => {
				let file = this.contexts.dist.get(req.path)

				if (file === undefined) {
					file = this.contexts.dist.get("index.html")
					req.indexHtml = file.content
				}

				if (!file) {
					throw new OperationError(404, "File not found")
				}

				const fileParts = file.path.split(".")
				const extension = fileParts[fileParts.length - 1]

				let content: Buffer<ArrayBufferLike> | Stream.Readable =
					file.content

				if (!content) {
					content = file.stream()
				}

				if (!content) {
					return res
						.status(500)
						.json({ error: "Cannot read this file" })
				}

				if (content instanceof Buffer) {
					return res.type(extension).send(content)
				} else {
					return res.type(extension).stream(content)
				}
			},
		},
	}

	contexts = {
		dist: new LiveDirectory("./src/.vitepress/dist", {
			static: true,
		}),
	}
}

Boot(DocsServer)
