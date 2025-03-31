import { performance } from "node:perf_hooks"

export default {
	ping: async (client, data) => {
		client.emit("pong")
	},
	"topic:subscribe": async (client, topic) => {
		client.subscribe(topic)
	},
	"topic:unsubscribe": async (client, topic) => {
		client.unsubscribe(topic)
	},
}
