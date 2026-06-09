import API from "@/index"

export default defineRoute<API>()({
	fn: (req, res) => {
		const stream = res.sse
		if (!stream) return

		stream.open()

		const timer = setInterval(() => {
			if (!stream.active) {
				clearInterval(timer)
				return
			}
			stream.send("message", JSON.stringify({ text: "hi!" }))
		}, 1000)
	},
})
